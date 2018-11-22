/**
 * Put your mandatory setting here:
 *     - node: address of your node in the form http://<ip>:<port
 */

var config = {
    payoutfileprefix: 'wavesleaserpayouts',
    node: 'http://localhost:6869',	//Change this value to your blockchain node
    paymentqueuefile: 'payqueue.dat'
};

var fs = require('fs');
var request = require('request');
var os = require('os');

var payments;
var payjobs;
var payjobcounter = 0;
var assetsumarray = {};
var assetamount = 0;


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

	// Read logfile for current batch and get the blocks that were forged
	function getblocksforged () {
        	var batchlogfile = config.payoutfileprefix + batchid + '.log'
        	var batchlogarray = (fs.readFileSync(batchlogfile).toString()).split(os.EOL)
        	var forgedblocksstring = batchlogarray.find(a =>a.includes("forged:"));
		blocks += parseInt(forgedblocksstring.substring(forgedblocksstring.indexOf(":")+1,forgedblocksstring.length))
        	return forgedblocksstring
	}

	function constructassetsarray () {

		payments.forEach(function(payment) {		//For every json set { } found, which marks 1 payment

       			if (payment.assetId) {			//We found an 'assetId' for current payment (tokens, not WAVES!)
       				if (!assets[payment.assetId]) { //First time found -> not in var assets {} yet
               				assetsFound++;		//Increase var assetFound with 1
               				assets[payment.assetId] = {	//Set token string in asset array
						batchid: batchid,
               					amount: payment.amount,	//set amount from payment {} to asset.amount
               					decimals: 0,
               					name: ''	//name is empty
               				};
       				} else {			//This 'assetId' was already set in assets array 
               				assets[payment.assetId].amount += payment.amount;	//Increase the amount with next payment {} amount
       	  			}
       			} else {	// 'assetId' not found in one set {} -> means WAVES transactions
       				if (!assets['Waves']) {		//First time found -> not in var assets {} yet
       					assetsFound++;		//Increase var assetFound with 1
                			assets['Waves'] = {	//Set Waves string in asset array
						batchid: batchid,
                    				amount: payment.amount,	//set amount from payment {} to Waves.amount in assets array
                    				decimals: 8,
                    				name: 'Waves'	//set name key to 'Waves' in assets array
                			};
            			} else {			//Waves bestaat al in assets array
               				assets['Waves'].amount += payment.amount;	//Increase the amount with next payment {} amount
            			}
        		}
		});	//End forEach

		if ( payments.length == 0 ) {	//Payout file IS empty, no payouts needed

			addmessage = 'Nothing to pay! ' + getblocksforged()

		} else {	//Payout file is NOT empty, let's dig up amount and asset info

			addmessage = payments.length + ' payments. ' + getblocksforged()
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

               						if (assetsFound - 1 === counter) {
                       						cb();
               	 					}
               					}
            				});
        			}
    			} //End for
		}; //End var addAssetInfo
		
		console.log(message + addmessage);

		addAssetInfo(assets, function() {	//assets is the array filled with the total amounts for all assetIds

			var i = 0
			for (var assetId in assets) {	//For every asset found in one batch
       				var asset = assets[assetId];

				i++	//Counter to know when we reached the end of the for loop
				console.log("    " + jobnr + ": " + (asset.amount / Math.pow(10, asset.decimals)) + ' of ' + asset.name + ' will be paid!');		
			
				if (!assetsumarray[asset.name]) {	//This asset is not in the Array yet
					assetsumarray[asset.name] = { amount: asset.amount, decimals: asset.decimals }
				} else {
					assetsumarray[asset.name].amount += asset.amount	//Asset is found already, increase amount
				  }

				if ( assetsFound  == i ) { console.log() }	//Print empty line after last asset is returned in this  batch
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
						console.log(" - " + (asset.amount / Math.pow(10, asset.decimals)), assetid + " will be paid!");
						i++
					}
					console.log('\ntotal blocks: ' + blocks + '\n');
				  }
			}, 150);
		} 

	} //end function constructassetsarray

	constructassetsarray();

}	//End function checkpayouts

//Start Main program
ifstart();
