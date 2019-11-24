
var os = require('os');
var fs = require('fs');
var request = require('request');

const configfile = 'config.json'

if (fs.existsSync(configfile)) { //configurationfile is found, let's read contents and set variables

        const rawconfiguration = fs.readFileSync(configfile)
        const jsonconfiguration = JSON.parse(rawconfiguration)

        toolconfigdata = jsonconfiguration['toolbaseconfig']
        paymentconfigdata = jsonconfiguration['paymentconfig']

        //define all vars related to the payment settings
        var myquerynode = paymentconfigdata['querynode_api']
        var mailto = paymentconfigdata['mail']

        //define all vars related to the tool settings
        var batchinfofile = toolconfigdata['batchinfofile']
        var payqueuefile = toolconfigdata['payqueuefile']
        var payoutfilesprefix = toolconfigdata['payoutfilesprefix']
}
else {
     console.log("\n Error, configuration file '" + configfile + "' missing.\n"
                +" Please get a complete copy of the code from github. Will stop now.\n");
     return //exit program
}

var config = {
    payoutfileprefix: payoutfilesprefix,
    node: myquerynode,
    paymentqueuefile: payqueuefile
};

var payments;
var payjobs;
var payjobcounter = 0;
var assetsumarray = {};
var assetamount = 0;
var allbatchsinglecost = 0
var allbatchmasstxcost = 0

const transferfee = parseInt(toolconfigdata.txbasefee) //basefee for a transaction
const masstransferfee = parseInt(toolconfigdata.masstransferpertxfee) //Additional fee for every recipient in a masstransfer (N*x)
const maxmasstransfertxs = parseInt(toolconfigdata.maxmasstransfertxs) //Maximum nr of transactions that fit in 1 masstransfer

//This function rounds a number up to the nearest upper number
//i.e. number is 230000, upper is 100000 -> 300000
//i.e. number is 180000, upper is 100000 -> 200000
//@params number: the number to normalize
//@params upper: the nearest upper number for roundup
function roundup(number, upper) {

        var i = number - upper

        while ( i > upper ) {
                i -= upper
        }
        var delta = upper - i
	number += delta
        return number
}

//This function is started first in main program
//It executes some test cases before main start() runs
function ifstart () {
	
	if ( !fs.existsSync(config.paymentqueuefile) ) { 
		console.log("Paymentqueue file '" + config.paymentqueuefile + "' not found. Start a collector session first and then try again.")
	} else {
		paymentids = JSON.parse(fs.readFileSync(config.paymentqueuefile))
		if ( paymentids.length == 0 ) { console.log("The paymentqueue is empty, no payments to check"); }
		else { start(); }
	}
}


// Method that starts the checking process
// - Find all pending paymentIDs from paymentqueue file
// - For every corresponding payout files check the payments
var checkallpendingpayouts = function () {

	var batchid;	//Number of the paymentbatch that is stored in the queue file
	var payqueuearray = JSON.parse(fs.readFileSync(config.paymentqueuefile));	//read the payqueue file with all payoutjobs
	var payoutfilenameprefix;
	var timeout = 0;
	payjobs = parseInt(payqueuearray.length)

	console.log("\nFound " + payqueuearray.length + " pending pay jobs in the queue file.\n"
		   +"=============================================================================================");

	payqueuearray.forEach ( function ( batchid, index ) {  //remark: index in array starts at 0!

                var jobid = parseInt(index) + 1		//Sequencial jobnr just for nice screen presentation
                payoutfilenameprefix = config.payoutfileprefix + batchid
                payoutfilename = payoutfilenameprefix + ".json"		//Filename where all paymentinfo is stored
		timeout = parseInt(index)*50;

                // Start function that checks the payoutcontents for the batchid
                setTimeout(checkpayouts, timeout, payoutfilename, batchid, jobid);

        });
}


// This is the main function that is called from main program part
var start = function() {
	checkallpendingpayouts();
}


// This function does the actual payment checks in the payoutfile
// - arg filename: the payoutfile name to be checked
// - batchid: paymentid for job
// - jobnr: sequence nr of all jobs (starts at 1)

var blocks = 0

function checkpayouts (filename, batchid, jobnr) {

	var assets = {};
	var assetsFound = 0;
	var paymentsString = fs.readFileSync(filename).toString();
	payments = JSON.parse(paymentsString);
	var addmessage;
	var message = "Job " + jobnr + ", batch ID " + batchid + ", payoutfile '" + filename + "'. "
	payjobcounter++
	pay = 'no' //key that tells no or yes if the recipient should get payout

	// Read logfile for current batch and get the blocks that were forged
	function getblocksforged () {
        	var batchlogfile = config.payoutfileprefix + batchid + '.log'
        	var batchlogarray = (fs.readFileSync(batchlogfile).toString()).split(os.EOL)
        	var forgedblocksstring = batchlogarray.find(a =>a.includes("forged:"));
		blocks += parseInt(forgedblocksstring.substring(forgedblocksstring.indexOf(":")+1,forgedblocksstring.length))
        	return forgedblocksstring
	}

	function constructassetsarray () {
		
		yescounter = 0 //counts all transactions with pay = yes

		payments.forEach(function(payment) {		//For every json set { } found, which marks 1 payment

			pay = payment.pay
			if (pay == undefined) { pay = 'yes' }
			if (pay == 'yes') { yescounter++ }
       			if (payment.assetId) {			//We found an 'assetId' for current payment (tokens, not WAVES!)
       				if (!assets[payment.assetId]) { //First time found -> not in var assets {} yet
               				assetsFound++;		//Increase var assetFound with 1
               				assets[payment.assetId] = {	//Set token string in asset array
						batchid: batchid,
               					amount: payment.amount,	//amount key which counts total found
						nopayamount: 0,
						payamount: 0,
						transactions: 1, //set counter on first transaction
               					decimals: 0,
               					name: ''	//name is empty
               				};
					if (pay == "no") { //amount key which counts nopayouts
						assets[payment.assetId].nopayamount = payment.amount
						assets[payment.assetId].transactions = 0
					} else { assets[payment.assetId].payamount = payment.amount }  //amount key which counts payouts
       				} else {	//This 'assetId' was already set in assets array 
               				assets[payment.assetId].amount += payment.amount; //Increase the total amount
					if (pay == 'no') { //increase nopayout amount
							assets[payment.assetId].nopayamount += payment.amount
					} else {
						assets[payment.assetId].payamount += payment.amount //increase payout amount
						assets[payment.assetId].transactions++ //increase counter asset transactions
					}
       	  			}
       			} else {	// 'assetId' not found in one set {} -> means WAVES transactions
       				if (!assets['Waves']) {		//First time found -> not in var assets {} yet
       					assetsFound++;		//Increase var assetFound with 1
                			assets['Waves'] = {	//Set Waves string in asset array
						batchid: batchid,
                    				amount: payment.amount,	//set amount from payment {} to Waves.amount in assets array
						nopayamount: 0,
                                                payamount: 0,
						transactions: 1, //Set counter on first transaction
                    				decimals: 8,
                    				name: 'Waves'	//set name key to 'Waves' in assets array
                			};
					if (pay == "no") {
						assets['Waves'].nopayamount = payment.amount //amount key which counts nopayouts
						assets['Waves'].transactions = 0
					} else { assets['Waves'].payamount = payment.amount }  //amount key which counts payouts
            			} else {	//Waves bestaat al in assets array
               				assets['Waves'].amount += payment.amount;	//Increase the amount with next payment {} amount
					if (pay == 'no') {
						assets['Waves'].nopayamount += payment.amount  //increase nopayout amount
					} else {
						assets['Waves'].payamount += payment.amount  //increase payout amount
						assets['Waves'].transactions++ //Increase counter Waves transactons
					}
            			}
        		}
		});	//End forEach

		if (payments.length == 0 || yescounter == 0) { //Payout file IS empty, no payouts needed

			addmessage = 'Nothing to pay! ' + getblocksforged()

		} else {	//Payout file is NOT empty, let's dig up amount and asset info

			addmessage = yescounter + ' payments. ' + getblocksforged()
		  }

		/**
 		* Method that adds infor like decimals and name to an asset.
 		*
 		* @param assets The asset that have been found
 		* @param cb The callback that gets executed after all infos are added
 		*/
		var addAssetInfo = function(assets, cb) {
    			var counter = 0;

    			for (var assetId in assets) {

        			if (assetId !== 'Waves') {
            				request.get(config.node + '/transactions/info/' + assetId, function(err, response, body) {
               					if (!err) {
               						var asset = JSON.parse(body);

               						counter++;
               						assets[asset.assetId].decimals = asset.decimals;
               						assets[asset.assetId].name = asset.name;

               						if (assetsFound === counter) {
                       						cb();
               	 					}
               					}
            				});
        			} else {
					counter++
				}
				if (assetsFound === counter) { cb() } //assetsFound is 'Waves + tokens'
    			} //End for
		}; //End var addAssetInfo

		console.log(message + addmessage);

		var nopayoutsum
		var payoutsum

		addAssetInfo(assets, function() {	//assets is the array filled with the total amounts for all assetIds

			var singletransactions = 0
			var masstransfers = 0
			var singletxscosts = 0
			var masstransfercosts = 0
			var totalmasstransfers = 0
			var i = 0

			for (var assetId in assets) {	//For every asset found in one batch

       				var asset = assets[assetId];
				nopayoutsum = assets[assetId].nopayamount //total of nopayout fees
				payoutsum = assets[assetId].payamount //total of payout fees
				
				singletransactions += asset.transactions //increase transactioncounter for single transactions (these are real paid txs)
				masstransfers = Math.ceil(asset.transactions/maxmasstransfertxs) //how many masstransfers for one asset
				
				if (masstransfers == 1) { //Only 1 masstransfer needed

					var transfercost = transferfee + masstransferfee*asset.transactions
					masstransfercosts += roundup(transfercost, transferfee)

				} else { //More than 1 masstransfer needed

					var lasttxs = asset.transactions - (masstransfers - 1) * maxmasstransfertxs //How many transactions in last masstransfer 
					var lastmasstxscost = transferfee + masstransferfee*lasttxs //Cost for last masstransfer
					masstransfercosts += roundup(lastmasstxscost, transferfee)

					//How much is the cost for a masstransfers, other then the last
					var transfercost = transferfee + masstransferfee*maxmasstransfertxs
					masstransfercosts += (roundup(transfercost, transferfee))*(masstransfers-1) //Cost for all masstransfers (except last)
				}

				totalmasstransfers += masstransfers

				i++	//Counter to know when we reached the end of the for loop
				
				if (nopayoutsum == 0) { //Everyone gets payed	
					console.log("    " + jobnr + ": " + (asset.amount / Math.pow(10, asset.decimals)) + ' of ' + asset.name + ' will be paid!');		
				} else { //There are NO PAYOUT addresses
					console.log("    " + jobnr + ": " + (asset.amount / Math.pow(10, asset.decimals)) + ' of ' + asset.name + ' in total ' +
						    "(" + (payoutsum / Math.pow(10, asset.decimals)) + " PAY / " + (nopayoutsum / Math.pow(10, asset.decimals)) +
						    " NO PAY)")
				}
				

			
				if (!assetsumarray[asset.name]) {	//This asset is not in the Array yet
					assetsumarray[asset.name] = { amount: asset.amount,
								      payamount: payoutsum,
								      nopayamount: nopayoutsum,
								      decimals: asset.decimals
					}

				} else {
					assetsumarray[asset.name].amount += asset.amount //Asset is found already, increase amount
					assetsumarray[asset.name].nopayamount += nopayoutsum,
					assetsumarray[asset.name].payamount += payoutsum
				}

				if ( assetsFound  == i ) { //Reached last asset
					console.log()	//Print empty line after last asset is returned in this  batch
					singletxscosts = singletransactions*transferfee/Math.pow(10, 8)
					masstransfercosts = masstransfercosts/Math.pow(10, 8)

					console.log("    " + jobnr + ": Cost involved with " + singletransactions + " single transactions: " + singletxscosts + " Waves.")
					console.log("    " + jobnr + ": Cost involved with " + totalmasstransfers + " masstransfers: " + masstransfercosts + " Waves.\n")

					allbatchsinglecost += singletxscosts
					allbatchmasstxcost += masstransfercosts

				}
			}
   		});	//End function addAssetInfo

		if ( payjobcounter == payjobs ) {	//Reached end of payjob queue, print sum of all assets of all pending payment jobs
			setTimeout(function() {
				console.log("=============================================================================================\n" +
					    "Finished checking all jobs in the payment queue. The total sum of all payouts will be;\n");

				if ( JSON.stringify(assetsumarray) == '{}' ) {
					console.log("Nothing to pay.")
				} else {
					var i = 0;
					for (var assetid in assetsumarray) {
						var asset = assetsumarray[assetid];
						if (asset.nopayamount == 0) { //Everyone gets paid!
							console.log(" - " + (asset.amount / Math.pow(10, asset.decimals)), assetid + " will be paid!");
						} else { //Found some amount which is not paid!
							console.log(" - " + (asset.amount / Math.pow(10, asset.decimals)), assetid + " in total " +
								    "(" + (asset.payamount / Math.pow(10, asset.decimals)) + " PAY / " +
								    (asset.nopayamount / Math.pow(10, asset.decimals)) + " NO PAY)")
						}
						i++
					}
					console.log('\ntotal blocks: ' + blocks + '\n');
					console.log("Total Waves transaction fee when single transactions would be used: " + allbatchsinglecost)
					console.log("Total Waves transaction fee when masstransfers would be used: " + allbatchmasstxcost.toFixed(8) + "\n")

					if ( allbatchmasstxcost < allbatchsinglecost ) {
						console.log("It's cheapest to do the payouts with masstransfers. You save " +
							    ((1-allbatchmasstxcost/allbatchsinglecost)*100).toFixed(1) + " percent.")
						console.log("Start your masstransfer with 'node masstx'.\n")
					} else if ( allbatchmasstxcost == allbatchsinglecost ) {
						console.log("Single transactions and masstransfers incur the same cost. Choose whichever you like;")
						console.log(" - for single transactions: 'node massPayment.js'")
						console.log(" - for masstransfers: 'node masstx.js'\n")
					} else {
						console.log("Single transactions are cheapest to do the payments.")
						console.log("To do single transactions, use tool 'node massPayment.js'\n")
					}
					if ( payjobs >= 2 ) {
						console.log("\n REMARK:\n" +
							    " Found '" + payjobs + "' payjobs in the queue.\n" +
							    " Consider executing tool './txoptimizer.py' first, before you do your payments.\n" +
							    " The optimizer tool will merge all the pending payjobs into one larger payjob.\n" +
							    " This will save you on transaction costs!! ;-)\n" +
							    " To optimize, just type: ./txoptimizer.py\n" +
							    " When finished, you can do the payment: node masstx\n")
					}
				  }
			}, 150);
		} 

	} //end function constructassetsarray

	constructassetsarray();

}	//End function checkpayouts

//Start Main program
ifstart();
