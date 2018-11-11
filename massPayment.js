/**
 *  Put your settings here, bare minimum:
 *      - node: address of your node in the form http://<ip>:<port>
 *      - apiKey: the API key of the node that is used for distribution
 *
 * That's it! Enjoy
 */

var config = {
    payoutfileprefix: 'wavesleaserpayouts',
    node: 'http://localhost:6869',
    apiKey: 'your api key'
};

const paymentqueuefile = 'payqueue.dat'
const transactiontimeout = 1000
const paymentsdonedir = 'paymentsDone/'


// THIS CONST VALUE IS NEEDED WHEN THE PAYMENT PROCESS HALTS OR CRASHES
// Just change the batchidstart value to the BatchID that was active when the crash occured,
// and change the transactionstart value to the last succesfull transaction +1.
// And then restart the payment process. That's it. No more changes needed.
// You can leave it as is and do not have to change it back to 0
const crashconfig = {
	batchidstart: '0',
	transactionstart: '0' }

var fs = require('fs');
var request = require('request');
var newpayqueue = []

/*
** Method to do some tests before program run any further
** This is the first function that runs
*/
function testcases () {

	if ( !fs.existsSync(paymentsdonedir) ) {
		fs.mkdirSync(paymentsdonedir, 0744)
		getpayqueue(start);
	}
	else if ( !fs.existsSync(paymentqueuefile) ) {
		console.log("Missing file " + paymentqueuefile + "! Run collector session first. Goodbye")
	}
	else if ( JSON.parse(fs.readFileSync(paymentqueuefile)).length == 0 ) {
		console.log("Empty payqueue! Nothing to pay, goodbye :-)")
	}
	else {
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
	var backuppayqueue = fs.writeFileSync(paymentqueuefile+".bak",fs.readFileSync(paymentqueuefile))	//Create backup of queuefile
	var batchpaymentarray
	var cleanpayqueuearray = payqueuearray.filter(getnonemptybatches)	// This var is the payqueue array without zero pay jobs
	newpayqueue = cleanpayqueuearray
	var transactiondelay = 0
	var timeoutarray = [];
	timeoutarray[0] = 0;


	cleanpayqueuearray.forEach ( function ( batchid, index ) {  //remark: index in array starts at 0!

                payoutfilename = config.payoutfileprefix + batchid + '.json'
		batchpaymentarray = JSON.parse(fs.readFileSync(payoutfilename),toString())	//All transaction details current batch
		var transactioncount = parseInt(batchpaymentarray.length)	//how many transactions current batch
		var transactiondelay = transactioncount*transactiontimeout	//total time needed for all transactions one current batch
		timeoutarray[index+1] = timeoutarray[index] + transactiondelay

		setTimeout(myfunction, timeoutarray[index], batchpaymentarray, batchid) 

        }) //End forEach

} //End function getpayqueue

function updatepayqueuefile (array, batchid) {

	array.shift(console.log("\nDone with batch " + batchid + ". Removed from the payqueue and succesfully updated file " + paymentqueuefile + "!\n"));

		fs.writeFile(paymentqueuefile, JSON.stringify(array), {}, function(err) {
        		if (!err) { } else { console.log("Warning, errors writing payqueue file!\n",err); }
    		});

		fs.renameSync(config.payoutfileprefix + batchid + ".json", paymentsdonedir + config.payoutfileprefix + batchid + ".json")
		fs.renameSync(config.payoutfileprefix + batchid + ".html", paymentsdonedir + config.payoutfileprefix + batchid + ".html")
		fs.renameSync(config.payoutfileprefix + batchid + ".log", paymentsdonedir + config.payoutfileprefix + batchid + ".log")

		console.log("Moved leaserpayoutfiles of batch " + batchid + " to directory " + paymentsdonedir + " for archival purposes.")
		console.log("  - " + config.payoutfileprefix + batchid + ".json => " + paymentsdonedir + config.payoutfileprefix + batchid + ".json")
		console.log("  - " + config.payoutfileprefix + batchid + ".html => " + paymentsdonedir + config.payoutfileprefix + batchid + ".html")
		console.log("  - " + config.payoutfileprefix + batchid + ".log => " + paymentsdonedir + config.payoutfileprefix + batchid + ".log")
		console.log();
}

/**
 * The method that starts the payment process.
 * @params jsonarray the array with the payments of the batch
 * @params queueid the var batchId (number from the payarray)
 */
var start = function(jsonarray, queueid) {
    var payments = jsonarray;

    if ( crashconfig.batchidstart == queueid && crashconfig.transactionstart > 0 ) {
	doPayment(payments, crashconfig.transactionstart, queueid)	//Start payment process after crash occured
    }
    else {	//Start normal payment process
	doPayment(payments, 0, queueid)
    }
};

/**
 * This method executes the actual payment transactions. One per second, so that the network
 * is not flooded. This could potentially be modified once the transaction limit of 100 tx
 * per block is raised.
 *
 * @param payments the array of payments (necessary to start this method recursively)
 * @param counter the current payment that should be done
 */
var doPayment = function(payments, counter, batchid) {
	var payment = payments[counter];

	if ( payment.assetId == undefined ) { var assetname = 'Waves' }
	else { assetname = payment.assetId }

	setTimeout(function() {
		request.post({  url: config.node + '/assets/transfer',
				json: payment,
				headers: { "Accept": "application/json", "Content-Type": "application/json", "api_key": config.apiKey }
			     }, function(err) {
            				if (err) {
                				console.log(err);
            				} else {
                				console.log('[batchID ' + batchid + '] ' + counter + ' send ' + payment.amount + 
							    ' of ' + assetname + ' to ' + payment.recipient + '!');
                				counter++;
						if (counter < payments.length) {
							doPayment(payments, counter, batchid);
						} else { updatepayqueuefile(newpayqueue,batchid) }
					  }
				});
	}, transactiontimeout);
};

testcases();
