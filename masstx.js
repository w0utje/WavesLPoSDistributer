
var fs = require('fs');
var request = require('request');
const readline = require('readline');

const configfile = 'config.json'
const masstxrunfile = 'masstx.run'
const forgedblockstext = "blocks forged:"
const distributiontext = "Distribution:"

if (fs.existsSync(configfile)) { //configurationfile is found, let's read contents and set variables

        const rawconfiguration = fs.readFileSync(configfile)
        const jsonconfiguration = JSON.parse(rawconfiguration)

        toolconfigdata = jsonconfiguration['toolbaseconfig']
        paymentconfigdata = jsonconfiguration['paymentconfig']


        //define all vars related to the payment settings
        var myquerynode = paymentconfigdata['paymentnode_api']
        var mailto = paymentconfigdata['mail']
	var sm = paymentconfigdata['socialmedia']

        //define all vars related to the tool settings
        var batchinfofile = toolconfigdata['batchinfofile']
        var payqueuefile = toolconfigdata['payqueuefile']
        var payoutfilesprefix = toolconfigdata['payoutfilesprefix']
	var socialmediafile = toolconfigdata['socialmediafile']
	var nodename = paymentconfigdata['nodename']

}
else {
     console.log("\n Error, configuration file '" + configfile + "' missing.\n"
                +" Please get a complete copy of the code from github. Will stop now.\n");
     return //exit program
}

var config = {
    payoutfileprefix: payoutfilesprefix,
    node: myquerynode,
    apiKey: paymentconfigdata.paymentnode_apikey
};

if ( paymentconfigdata['payreports'] ) { //payreports keys for report upload is in json file
	var payreport = paymentconfigdata['payreports']
} else {
	var payreport = { 'provider' : '' } //payreport keys not in json file
	console.log("\n* WARNING:\n" +
		    "* You have an old config.json file, missing some json data.\n" +
		    "* You miss nice features to automatically upload your leasing reports to Cloud providers,\n" +
		    "* or to a webserver folder. Better download the latest configfile from Github.\n")
}
const paymentqueuefile = payqueuefile //Queue file with all payment ids to be processed
const transactiontimeout = parseInt(toolconfigdata.transactiontimeout) //Msecs to wait between every transaction posted
const paymentsdonedir = toolconfigdata.paymentsdonedir //Where to move files after processing
const maxmasstransfertxs = parseInt(toolconfigdata.maxmasstransfertxs) //Maximum nr of transactions that fit in 1 masstransfer
const coins = toolconfigdata.relevantassets //Which coins we take into consideration for masstransfers
const transferfee = parseInt(toolconfigdata.txbasefee)
const masstransferfee = parseInt(toolconfigdata.masstransferpertxfee)
const masstransferversion = parseInt(toolconfigdata.masstransferversion)

// THIS CONST VALUE IS NEEDED WHEN THE PAYMENT PROCESS HALTS OR CRASHES
// Just change the batchidstart value to the BatchID that was active when the crash occured,
// and change the transactionstart value to the last succesfull transaction +1.
// And then restart the payment process. That's it. No more changes needed.
// You can leave it as is and do not have to change it back to 0
const crashconfig = {
	batchidstart: '0',
	transactionstart: '0' }

var newpayqueue = []
var jobs
var reporturlarray = []
var blocks = 0 //The sum of total nr. of forged blocks of all payjobs 
var number = 0 //The average distribution of fee sharing
var nonzerojobs //Number of nonzero payjobs in queue 
var totalwaves = 0 //total waves amount all batches for pay is "yes"
var totalwavesamount = 0 //total amount of waves all batches
var totalyesnowaves = 0 //total forged waves all batches
var roundedwaves = 0 //total waves all batches for pay is "yes"
var timestamp = new Date()
var mydate = ("0" + timestamp.getDate()).slice(-2) + "-" + ("0" + (timestamp.getMonth()+1)).slice(-2) + "-" + timestamp.getFullYear()

//Function to write the social media update message
//to a file. This message can be picked up by another
//program to send to i.e. Telegram or twitter
function socialmediamessage( cb ) {
	
	var averagedist = number/nonzerojobs  //average % distribution share of all jobs
	var text = ""
	
	text =	"Dear Waves leasers," +
                "\n\nPeriodic payments have been done again." +
                "\nForged " + blocks + " blocks [ " + totalyesnowaves + " Waves (" + averagedist.toString() + "% share) ]" +
                "\n\nThe report can be consulted here:"

	reporturlarray.forEach( function (item,index) {
		text += "\n" + item
	})

	text +=	"\n\nThank you all for leasing to node " + nodename + "!" +
		"\n\n" + mydate + " - Enjoy the payday!" +
		"\n"

	fs.writeFile(mydate + "-" + socialmediafile, text, function(err) {
		if(err) {
			return console.log(err);
    		} else { cb() }

	}) //End writefile
}

function storesocialmediamessage (file) {

	var provider = sm.provider.toLowerCase()
	var target = sm.destination
	var region = sm.region

	if ( provider == 'aws' ) { //upload to aws bucket

		var AWS = require('aws-sdk')
		AWS.config.update({ region : awsregion})
                s3 = new AWS.S3({apiVersion: '2006-03-01'}); // Create S3 service object
                var uploadParams = { Bucket: target, Key: '', Body: '', ContentType:'text/html' };
		var fileStream = fs.createReadStream(file);
                fileStream.on('error', function(err) {
                	console.log('File Error', err)
                })
                uploadParams.Body = fileStream
                uploadParams.Key = file

		s3.upload (uploadParams, function (err, data) {
			
			if (err) {
                        	console.log("Error uploading to AWS! file:",file,err);
                        }
			if (data) { 
				fs.unlink(file, (err) => { //remove file
                                        if (err) {
                                                console.error(err)
                                        }
                                })
			}
		})
	}
	else if ( provider == 'local' ) { //upload to local folder

		if ( target[target.length-1] != '/' ) { target += '/' } //check / existence

		if (!fs.existsSync(target)) { //folder does not exist
			
			console.log(" * WARNING:\n" +
                                    " * Apparently destination folder '" + target + "' does not exist.\n" +
                                    " * Skipping upload of social media file '" + file + "' to folder '" + target + "'\n *" +
                                    "\n * Please manually create folder '" + target + "' and copy" +
                                    "\n * the social media file '" + file + "' to folder '" + target + "'\n *" +
                                    "\n * You can find the social media file in '" + process.cwd() + "/\n" )

		} else { //local folder exists

			dstfile = target + file
                        fs.copyFile(file, dstfile, (err) => {
                        	if (err) { throw err }
				else {
					fs.unlink(file, (err) => { //remove file
                                        	if (err) {
                                                	console.error(err)
                                        	}
                                	})
				}
                        })
		}
	}
}

//Function to upload the HTML report to a cloud location
//params: file, filename of file to upload
//	  batch, payjob from the payqueue
//	  cb, callback function to run when reached it
function reportupload(file,batch, cb) {

	if (payreport.provider != "") {
		requesturlprefix = payreport.requesturlprefix
		destination = payreport.destination
		
		if (payreport.provider.toLowerCase() == 'aws') {

			var AWS = require('aws-sdk')
			
			/*AWS.config.getCredentials(function(err) {
  				if (err) {
					console.log(err.stack);
				// credentials not loaded
				} else {
    					console.log("Access key:", AWS.config.credentials.accessKeyId);
    					console.log("Secret access key:", AWS.config.credentials.secretAccessKey);
  				}
			})*/
			
			awsregion = payreport.region
			AWS.config.update({ region : awsregion})

			// Create S3 service object
			s3 = new AWS.S3({apiVersion: '2006-03-01'});
			
			// call S3 to retrieve upload file to specified bucket
			var uploadParams = { Bucket: destination, Key: '', Body: '', ContentType:'text/html' };

			// Configure the file stream and obtain the upload parameters
			var fileStream = fs.createReadStream(file);
			fileStream.on('error', function(err) {
  				console.log('File Error', err);
			});
			uploadParams.Body = fileStream;
			//var path = require('path');
			//uploadParams.Key = path.basename(file);
			uploadParams.Key = parseInt(batch).toString() + '.html'
			// call S3 to retrieve upload file to specified bucket
			s3.upload (uploadParams, function (err, data) {
  				if (err) {
    					console.log("Error uploading report to AWS! Batch",batch,err);
  				} if (data) {
					if (requesturlprefix == "") { //If no requesturl, then use aws default for object
						requesturlprefix = data.Location
					} else {
						if (requesturlprefix[requesturlprefix.length-1] != '/') { requesturlprefix += '/' }
						requesturlprefix += uploadParams.Key //prefix + filename
					}
    					console.log("AWS S3 upload of report done:", data.Location +
						    "\nReport request url:",requesturlprefix + "\n")

					reporturlarray.push(requesturlprefix)
					requesturlprefix = "" //reset value is needed
					cb()
  				}
			});
		} else if (payreport.provider.toLowerCase() == 'local') { //Local folder destination

			if (destination[destination.length-1] != '/') { destination += '/' } //check / existence
        		if (!fs.existsSync(destination)) { //folder does not exists

                		console.log(" * WARNING:\n" +
                            		    " * Apparently destination folder '" + destination + "' does not exist.\n" +
                            		    " * Skipping upload of payreport '" + batch + ".html' to '" + destination + "'\n *" +
                            		    "\n * Please manually create folder '" + destination + "' and copy" +
                            		    "\n * the report file '" + file + "' to '" + destination + batch + ".html'\n *" +
                            		    "\n * You can find the report in '" + paymentsdonedir + "'")

				cb()

        		} else { //destination folder for report exist

                		dstfile = destination + batch + ".html"
                		fs.copyFile(file, dstfile, (err) => {
                        		if (err) throw err;
                        		console.log("Created local copy of report for your leasers:", dstfile +
                                    		    "\nReport request url:",requesturlprefix + batch + ".html\n");
					cb()
                		});
        		} //END else
		}
	} else { //No provider defined, no report upload,  only execute further payments
		cb()
	}
}

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

/*
** Method to do some tests before program run any further
** This is the first function that runs
*/
function testcases () {

	if ( !fs.existsSync(paymentqueuefile) ) {
		console.log("Missing file " + paymentqueuefile + "! Run collector session first. Goodbye")
		process.exit() //Terminate

	} else if ( fs.existsSync(masstxrunfile) ) {
		console.log("\nALERT:\n" +
			    "Found masstx interruptionfile. Apparently masstx was interupted abnormally last time!\n" +
			    "Normally if payments with masstx run 100% fine, this alert should not be given.\n" +
			    "Check your logs and if everything is fine, delete the crashfile: '" + masstxrunfile + "'\n" +
			    "\nGoodbye now!\n")
		process.exit() //Terminate

	} else if ( JSON.parse(fs.readFileSync(paymentqueuefile)).length == 0 ) {
                console.log("Empty payqueue! Nothing to pay, goodbye :-)")
		process.exit() //Terminate

	} else { //start program
		
		fs.closeSync(fs.openSync(masstxrunfile, 'w'))
		if ( !fs.existsSync(paymentsdonedir) ) { fs.mkdirSync(paymentsdonedir, 0744) }

		getpayqueue(start);
	}
}

/*
** Method to get only the batches from the paymentqueue file that are non-empty (with payouts)
** The batchid's are pushed into a new array
** @callback: returns the batchid
*/
function getnonemptybatches (batchid) {
	batchpaymentarray = JSON.parse(fs.readFileSync(config.payoutfileprefix + batchid + '.json'),toString())
	if ( batchpaymentarray.length == 0 ) {
		console.log("[BatchID " + batchid + "] empty, no payouts!")
		updatepayqueuefile(newpayqueue,batchid)
	}
	return !batchpaymentarray.length == 0 
}

/* Function to collect all some stats from the logfiles
 * @param
 * - logfile: logfile to collect forged blocks
 */
function collectlogfileitems(readfile) {

	const readInterface = readline.createInterface ({
		input: fs.createReadStream(readfile),
                //output: process.stdout,
                //console: false
        });

        readInterface.on('line', function(line) {

		if ( line.indexOf(forgedblockstext) != -1 ) {

			blocks += parseInt(line.slice(line.indexOf(':')+1))

                }
		if ( line.indexOf(distributiontext) != -1 ) {
			
			dist = line.slice(line.indexOf(':')+1)
			number += parseInt(dist.substring(0, dist.length - 1))
		}
        });
}


/*
** Method to collect all payouts per batch, read from the payoutfile
** It cycles through the paymentqueue and executes the myfunction,
** which is the function 'start'
** The actual payout transactions are done by the 'start' function
** In the start function transactions are delayed by timer 'transactiontimeout' (1000)
** The timeoutarray ensures that the transactions for the next batch are delayed,
** with the transactiondelay of the previous batches. This is needed because the
** forEach function executes the 'myfunction' as fast as it can, so this will create
** parallel processing.
*/
function getpayqueue (myfunction) {

	var payqueuearray = JSON.parse(fs.readFileSync(paymentqueuefile));
	jobs = payqueuearray.length
	var backuppayqueue = fs.writeFileSync(paymentqueuefile+".bak",fs.readFileSync(paymentqueuefile))	//Create backup of queuefile
	var batchpaymentarray
	var cleanpayqueuearray = payqueuearray.filter(getnonemptybatches)	// This var is the payqueue array without zero pay jobs
	newpayqueue = cleanpayqueuearray
	var txdelay = 0
	var timeoutarray = [];
	timeoutarray[0] = 0;
	nonzerojobs = cleanpayqueuearray.length

	cleanpayqueuearray.forEach ( function ( batchid, index ) {  //remark: index in array starts at 0!

                payoutfilename = config.payoutfileprefix + batchid + '.json'
		logfilename = config.payoutfileprefix + batchid + '.log'

		collectlogfileitems(logfilename)

		batchpaymentarray = JSON.parse(fs.readFileSync(payoutfilename),toString())	//All transaction details current batch
		var wavestransactions = 0
		var mrttransactions = 0
		var transactioncount = parseInt(batchpaymentarray.length)	//how many transactions current batch		
		var nrofmasstransfers //How many masstransfers needed for all payments
		var txdelay	//total time needed for all masstransfers in current batch
		var payout

		batchpaymentarray.forEach( function (asset,index) {
			
			if ( !asset.pay ) { //No pay key, means old collector version used, -> add pay key 'yes'}
                                batchpaymentarray[index].pay = 'yes'
				payout = 'yes'
                        } else { //Found pay key, get value yes/no
				payout = asset.pay
			}

			if (payout == 'yes') {
                		if ( !asset.assetId ) { wavestransactions++ }
				else if ( asset.assetId && coins.includes('Mrt') ) { mrttransactions++ }
			}
		})

		nrofmasstransfers = Math.ceil(wavestransactions/maxmasstransfertxs) + Math.ceil(mrttransactions/maxmasstransfertxs)
		txdelay = nrofmasstransfers*transactiontimeout
		timeoutarray[index+1] = timeoutarray[index] + txdelay

		setTimeout(myfunction, timeoutarray[index], batchpaymentarray, batchid, nrofmasstransfers) 

        }) //End forEach

} //End function getpayqueue

function updatepayqueuefile (array, batchid) {

	jobs-- //Count down everytime a job is done
	
	var htmlfile = (config.payoutfileprefix + batchid + ".html") //report file

	if ( batchpaymentarray.length == 0 ) { printline = "\nRemoved batch " + batchid + " from the payqueue and successfully updated file " + paymentqueuefile + "!\n" }
	else { printline = "\nAll payments done for batch " + batchid + ". Removed from the payqueue and succesfully updated file " + paymentqueuefile + "!\n" }

	array.shift(console.log(printline)) //Strip batchid from array

	fs.writeFile(paymentqueuefile, JSON.stringify(array), {}, function(err) {
        	if (!err) { } else { console.log("Warning, errors writing payqueue file!\n",err); }
    	});
	
	reportupload(htmlfile,batchid, function() { //Upload HTML file to it's destination

		fs.renameSync(config.payoutfileprefix + batchid + ".json", paymentsdonedir + config.payoutfileprefix + batchid + ".json")
		fs.renameSync(config.payoutfileprefix + batchid + ".html", paymentsdonedir + config.payoutfileprefix + batchid + ".html")
		fs.renameSync(config.payoutfileprefix + batchid + ".log", paymentsdonedir + config.payoutfileprefix + batchid + ".log")

		console.log("Moved leaserpayoutfiles of batch " + batchid + " to directory " + paymentsdonedir + " for archival purposes.")
		console.log("  - " + config.payoutfileprefix + batchid + ".json => " + paymentsdonedir + config.payoutfileprefix + batchid + ".json")
		console.log("  - " + config.payoutfileprefix + batchid + ".html => " + paymentsdonedir + config.payoutfileprefix + batchid + ".html")
		console.log("  - " + config.payoutfileprefix + batchid + ".log => " + paymentsdonedir + config.payoutfileprefix + batchid + ".log")

		if ( batchpaymentarray.length !== 0 ) {
			console.log("\nAppended payment masstransaction logs to " + config.payoutfileprefix + batchid + ".log for reference.")
		}
		console.log("\n======================= batch " + batchid + " all done =======================\n")

	  	if ( jobs == 0 ) { //Processed all jobs in the payqueue
			
			socialmediamessage( function() { //Create messagefile to be picked up by your favorite social media poster

			if ( sm['provider'] != "" ) { //upload socialmediafile to provider

				storesocialmediamessage( mydate + "-" + socialmediafile )

			}
			})
			console.log(" Finished payments for all jobs in the payqueue. All done :-)")
			console.log(" Saved message file to be picked up by your social media updater! (" +
                     		      mydate + "-" + socialmediafile + ")\n" )
                        console.log(" If you enjoy this script, Waves or tokens on Waves are welcome as a gift;\n\n" +
                               	    "   - wallet alias: 'donatewaves@plukkie'\n" +
                               	    "   - wallet address: '3PKQKCw6DdqCvuVgKtZMhNtwzf2aTZygPu6'\n\n" +
                               	    " Happy forging!\n")

			if (fs.existsSync(masstxrunfile)) {
				fs.unlink(masstxrunfile, (err) => { //All done, remove run file which is checked during startup
  					if (err) {
    						console.error(err)
    						return
  					}
				})
			}
                }
	});
}

/**
 * The method that starts the payment process.
 * @params jsonarray the array with the payments of the batch
 * @params queueid the var batchId (number from the payarray)
 * @params nromasstransfers is total masstransfers needed to pay one batchid
 */
var start = function(jsonarray, queueid, nrofmasstransfers) {
    var payments = jsonarray;

    if ( crashconfig.batchidstart == queueid && crashconfig.transactionstart > 0 ) { //start after crash occured
	doPayment(payments, crashconfig.transactionstart, queueid)	//Start payment process after crash occured
    }
    else {	//Start normal payment process
	doPayment(payments, 0, queueid, nrofmasstransfers)
    }
};

/**
 * This method executes the actual masspayment transactions.
 * It will only be done for the Coins defined in the 'const coins = array [  ]'
 * The limit is taken into consideration for the maximum transactions that fit (const maxmasstransfertxs)
 *
 * @param payments: the array of payments (one JSON import of the payment file belonging to a batch)
 * @param counter: the current payment that should be done (not used for now, always 0)
 * @param batchid: the payment batchid number from the payqueue
 * @param nrofmasstransfers: the #masstransfers to be done
**/
var doPayment = function(payments, counter, batchid, nrofmasstransfers) {

	var masstxsdone = 0 //counter to detect when all masstransfers are done for one payment batch
	var payment = {} //Payment object with all transactions for Waves and Mrt
	var masstxarray = [] //array with all transactions for 1 masstransfer
        var masstxpayment = {} //JSON object used for actual payment POST
	var decimalpts //how many decimals for a token
	var delayarray = [] //array to set timeout time related to all transactions to be done
	var logobject = "" //object to add to batchlogfile
	var transfercostbatch = 0 //transfercost for all masstransfers in a batch
        delayarray[0] = 0 //timeout for first asset will be zero

	masstransferobject(payments, function(cb) { payment = cb })      //VAR to construct masstransfer array, callback array with all transactions
	//console.log(payment)
	totalyesnowaves = parseInt(payment['Common']['Wavestotalamount'])/Math.pow(10,parseInt(payment['Common']['Wavespoints']))
	//console.log("total waves amount forged :",totalyesnowaves)

	coins.forEach( function (asset,index) {

		if ( asset in payment && payment[asset].length != 0) { //Found relevant coin in payment object

			var assettxs = payment[asset] //Array with all transactions
			var totaltxs = assettxs.length //Total number of transactions for one asset
			var masstransfers = Math.ceil(totaltxs/maxmasstransfertxs) //How many masstransfers needed for all payments
			var transactiondelay = masstransfers*transactiontimeout //total time needed for all masstransfers current asset
			var ii = 0 //Counter for all transactions

			delayarray[index+1] = delayarray[index] + transactiondelay //Set timeout for next asset

			setTimeout( function() { //Start function actions for an Asset

				var assetamount = 0
				var masstransfercounter = masstransfers
				var loop = totaltxs
				var onemasstransferamount
				var assetId = ''
				var masstransfercounterup = 0
				var logmessage

				if ( asset == 'Waves' ) { decimalpts = 8 } else if ( asset == 'Mrt' ) { decimalpts = 2 }
 				if ( asset !== 'Waves' ) { var assetId = payment["Common"][asset + "assetId"] }

				var masstransactionpayment = {	"version": masstransferversion,
								"proofs": [ "8Aa6EUtS6qsHEBWdx7PjkqrVsE4kBMwbixS5eSCLtiSq" ],
								"sender": payment.Common.sender,
								"attachment": payment.Common.attachment,
								"fee": 0 }

				if ( asset !== 'Waves' ) { masstransactionpayment.assetId = assetId } //Add assetId to json if asset is NOT Waves

				assettxs.forEach(function (asset) { assetamount += asset.amount }) //How much fees total for an asset

				if ( asset == 'Waves' ) {
					var text = "fee rewards"
					totalwaves += assetamount/Math.pow(10,decimalpts) 
					roundedwaves = Math.round(totalwaves * Math.pow(10,decimalpts)) / Math.pow(10,decimalpts)
				} else { var text = asset }

				logmessage = "[BatchID " + batchid + "] Found " + totaltxs + " '" + asset + "' transactions, total " + assetamount/Math.pow(10,decimalpts) +
                                            " " + text + ", will do " + masstransfers + " masstransfers."

				logobject += logmessage + "\n"

				console.log(logmessage)

				for ( var cnt = 0; cnt < masstransfers; cnt++ ) { //Loop through all masstransfers for one asset

					masstxarray = []
					onemasstransferamount = 0
					timeout = cnt*transactiontimeout //timeout for masstransfers

					setTimeout ( function () { //Start function masstransfers

						if ( loop > maxmasstransfertxs ) { loop = maxmasstransfertxs } 

						for ( var i = 0; i < loop; i++ ) { //Loop trough all transactions, max 'const masstransfer or #txs if 1 masstransfer

							masstxarray.push(assettxs[ii]) //cycle through all transactions
							onemasstransferamount += assettxs[ii].amount //how many fees in one masstransfer
							ii++ //counter for all transactions
						}

						masstransactionpayment['transfers'] = masstxarray //add transactions to payment json object
						masstransfercounter-- //For breaking the for loop
						masstransfercounterup++
						masstransfercost = transferfee + (masstransferfee * masstxarray.length)
						masstransfercost = roundup(masstransfercost, transferfee)
						masstransactionpayment.fee = masstransfercost //Add fee to masstransfer json object

						if ( totaltxs > maxmasstransfertxs ) { //calc number of transactions for last masstransfer
							if ( masstransfercounter == 1 ) { loop = totaltxs - (masstransfers-1)*maxmasstransfertxs }
						}
						if ( masstransfers == 1 ) { timeout = 0 } else { timeout = transactiontimeout }

						//Put here the actual POST function for a masstransfer
        	                                request.post({ url: config.node + toolconfigdata.masstxapisuffix,
								json: masstransactionpayment,
                        	                        	headers: { "Accept": "application/json", "Content-Type": "application/json", "api_key": config.apiKey }
                                        		     }, function(err) {
								if (err) {
                                                        		console.log(err);
                                                		} else {
									logmessage = "         " + batchid + "] - masstransfer " + masstransfercounterup +
                                                                                     " for " + asset + " done! Send " + onemasstransferamount/Math.pow(10,decimalpts) +
										     " " + asset + " with " + masstxarray.length + " transactions in it." +
										     " Cost " + masstransactionpayment.fee/Math.pow(10,8)

									console.log(logmessage)

									logobject += logmessage + "\n"
									masstxarray = []
									onemasstransferamount = 0
									masstxsdone++
									transfercostbatch += masstransactionpayment.fee/Math.pow(10,8)

									if ( masstxsdone == nrofmasstransfers ) { //Finished All masstransfers for one batch!

										console.log("\nTotal masstransfercosts: " + transfercostbatch + " Waves.")

										fs.appendFileSync(config.payoutfileprefix + batchid + ".log",
												  "\n======= masstx payment log [" +(new Date())+ "] =======\n" + logobject +
												  "\nTotal masstransfercosts: " + transfercostbatch + " Waves.\n" +
												  "All payments done for batch " + batchid + ".\n" +
												  "\nIf you enjoy this script, gifts are welcome at alias " +
											    	  "'donatewaves@plukkie'\n\n")

										
										updatepayqueuefile(newpayqueue,batchid)
									}
                                                		}
                                        	});
					}, timeout) //End function masstransfers
				} //End for all masstransfers loop
			}, delayarray[index]) //End function actions for an Asset
		} //End if ( asset in payment )
	}) //End loop coins.forEach
} //End var doPayment

/* This var will create the masstransferarray for Waves and Mrt
 * @param paymentarray: the array with all lease recipients with amounts
 * @param cb: the array transfers is returned to the caller
*/
var masstransferobject = function (paymentarray, cb) {
	var transfers = {}
	var waves = 'Waves'
	var mrt = 'Mrt'
	var common = 'Common'
	var wavesdistamount = 0
	var payout

	transfers[common] = {}
	transfers[waves] = []	//empty array where we will push waves recipients and amounts
	transfers[mrt] = []	//empty array where we will push mrt recipients and amounts
	transfers[common].Wavespoints = 8

	paymentarray.forEach (function(asset, index) {

		payout = asset.pay

		if ( asset.attachment ) { if ( !transfers[common].attachment == true ) { transfers[common].attachment = asset.attachment } }
		if ( asset.sender ) { if ( !transfers[common].sender == true ) { transfers[common].sender = asset.sender } }

		if ( !asset.assetId && payout == 'yes' ) { //No assetId means found Waves transaction

			var wavesdata = {	"recipient" : asset.recipient,
						"amount" : asset.amount }

			wavesdistamount += asset.amount
			totalwavesamount += asset.amount
			transfers[common].Wavesdistamount = wavesdistamount
			transfers[common].Wavestotalamount = totalwavesamount
			transfers[waves].push(wavesdata)

		} else if ( !asset.assetId && payout == 'no' ) { //No assetId means found Waves transaction

			totalwavesamount += asset.amount
			transfers[common].Wavestotalamount = totalwavesamount

		} else if ( asset.assetId && payout == 'yes' ) { //Found Mrt transaction
			
			if ( !transfers[common].MrtassetId == true ) { transfers[common].MrtassetId = asset.assetId }

			var mrtdata = {		"recipient" : asset.recipient,
						"amount" : asset.amount }

			transfers[mrt].push(mrtdata)
		  }
	})
	cb(transfers);
//console.log(transfers)
}

testcases();
