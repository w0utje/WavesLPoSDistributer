/* =================================================================================================================
 * V 1.1	'The lazy' version
 *
 * Plukkie's edit of W0utjes's LPoSDistributor V 2.0.3
 *
 * Donations are welcome if you like this version of the script: 'The one stop edit' version
 * - you can send waves to wallet alias 'plukkie'
 * - you can send your lease to waves alias 'plukkieforger'
 *
 * Please see CHANGELOG.txt for all features/changes
 * Please see README.md for complete explanation of LPoSdistributer package
 *
 * Bare minimum changes to edit:
 * - put your address here: const myleasewallet = '<Put your Leasewallet address here>';
 * - put the blockchain node and port where you access the API: const myquerynode = "http://<node ip/name:port here>";
 * - How many percentage fees do you want to share with your leasers: const feedistributionpercentage = <nr here>;
 * - How many blocks do you want to collect in every collector run: const blockwindowsize = <nr here>;
 *
 * Optional;
 * - How many MRT tokens to distribute per block: const mrtperblock = <nr here>;
 * - put here addresses that should not get fee share: var nofeearray = [ "<wallet address X>", 
 *									  "<wallet address Y>" ]
 *
 * Don't forget to set values in batchinfo.json only once! :-)
 * See README.md for explanation
 *
 * That's it!
 * Enjoy the happy (lazy) payout sessions that do the work for you!
 * ================================================================================================================= */


// START - Put your settings here
const myleasewallet = '<your node wallet>';	//Put here the address of the wallet that your node uses
const myquerynode = "http://localhost:6869";	//The node and API port that you use (defaults to localhost)
const feedistributionpercentage = 90;		//How many % do you want to share with your leasers (defaults to 90%)
const mrtperblock = 0;				//How many MRT tokens per block do you want to share with your leasers (default 0)
const blockwindowsize = 5000; 			//how many blockss to proces for every paymentcycle

// Put here wallet addresses that will receive no fees
// Could be wallets that award you with leases like the waves small node program
// var nofeearray = [ "3P6CwqcnK1wyW5TLzD15n79KbAsqAjQWXYZ",       //index0
//                    "3P9AodxBATXqFC3jtUydXv9YJ8ExAD2WXYZ" ];
var nofeearray = [ ]; 
// END - your settings



var request = require('sync-request');
var fs = require('fs');

// file with the batch data to start collecting. Will be updated after succesfull appng run
var batchinfofile = "batchinfo.json";
var payqueuefile    = "payqueue.dat";

if (fs.existsSync(batchinfofile)) {

   var backupbatchinfo = fs.writeFileSync(batchinfofile + ".bak",fs.readFileSync(batchinfofile))        //Create backup of batchdatafile
   var rawbatchinfo = fs.readFileSync(batchinfofile);
   var batchinfo = JSON.parse(rawbatchinfo);
  
   mybatchdata = batchinfo["batchdata"];
   paymentstartblock = parseInt(mybatchdata["paystartblock"]);
   paymentstopblock = parseInt(mybatchdata["paystopblock"]);
   startscanblock = parseInt(mybatchdata["scanstartblock"]);
   payid = parseInt(mybatchdata["paymentid"]); 
   attachment = mybatchdata["attachment"];

   // Collect height of last block in waves blockchain
   let options = {
	uri: "/blocks/height",
	baseUrl: myquerynode,
	method: "GET",
	headers: {
	json: true
	}
   };
   
   let blockchainresponse = request(options.method, options.baseUrl + options.uri, options.headers)
   let lastblockheight = parseInt(JSON.parse(blockchainresponse.body).height) 
   
   if (paymentstopblock > lastblockheight) {
	console.log("Current block is",lastblockheight,", will have to wait till it is greater then",paymentstopblock,"for next payment round.")
	return;
   };
} 
else {
     console.log();
     console.log("Error, batchfile",batchinfofile,"missing. Will stop now.");
     console.log();
     return; //if the batchinfofile doesn't exist stop further processing
}

var config = {
    address: myleasewallet,
    startBlockHeight: paymentstartblock,
    endBlock: paymentstopblock,
    distributableMrtPerBlock: mrtperblock,  //MRT distribution stopped
    filename: 'wavesleaserpayouts', //.json added automatically
    paymentid: payid,
    node: myquerynode,
    //node: 'http://nodes.wavesnodes.com',
    assetFeeId: null, //not used anymore with sponsored tx
    feeAmount: 100000,
    paymentAttachment: attachment, 
    percentageOfFeesToDistribute: feedistributionpercentage
};

var myLeases = {};
var myCanceledLeases = {};

var currentStartBlock = startscanblock;

var fs=require('fs');
var prevleaseinfofile = config.startBlockHeight + "_" + config.address + ".json";
if (fs.existsSync(prevleaseinfofile))
{
	console.log("reading " + prevleaseinfofile + " file");
	var data=fs.readFileSync(prevleaseinfofile);
	var prevleaseinfo=JSON.parse(data);
	myLeases = prevleaseinfo["leases"];
	myCanceledLeases = prevleaseinfo["canceledleases"];
	currentStartBlock = config.startBlockHeight;
}

//do some cleaning
var cleancount = 0;
for(var cancelindex in myCanceledLeases)
{
    if(myCanceledLeases[cancelindex].leaseId in myLeases)
    {
        //remove from both arrays, we don't need them anymore
        delete myLeases[cancelindex];
        delete myCanceledLeases[cancelindex];
        cleancount++;
    }

}
console.log("done cleaning, removed: " + cleancount);

var payments = [];
var mrt = [];

var myAliases = [];

var BlockCount = 0;

var LastBlock = {};

var myForgedBlocks = [];

/**
  * This method starts the overall process by first downloading the blocks,
  * preparing the necessary datastructures and finally preparing the payments
  * and serializing them into a file that could be used as input for the
  * masspayment tool.
 */
var start = function() {
  console.log('get aliases');
  myAliases = getAllAlias();
    console.log('getting blocks...');
    var blocks = getAllBlocks();
    console.log('preparing datastructures...');
    prepareDataStructure(blocks);
    console.log('preparing payments...');
    myForgedBlocks.forEach(function(block) {
        if (block.height >= config.startBlockHeight && block.height <= config.endBlock) {
            var blockLeaseData = getActiveLeasesAtBlock(block);
            var activeLeasesForBlock = blockLeaseData.activeLeases;
            var amountTotalLeased = blockLeaseData.totalLeased;

            distribute(activeLeasesForBlock, amountTotalLeased, block);
            BlockCount++;
        }
    });
    //Get last block
    LastBlock = blocks.slice(-1)[0] ;

    pay();
    console.log("blocks forged: " + BlockCount);
};

/**
 * This method organizes the datastructures that are later on necessary
 * for the block-exact analysis of the leases.
 *
 *   @param blocks all blocks that should be considered
 */

var prepareDataStructure = function(blocks) {

    blocks.forEach(function(block,index) {
    var checkprevblock = false;
	var myblock = false;
        var wavesFees = 0;

        if (block.generator === config.address)
        {
            myForgedBlocks.push(block);
            checkprevblock = true;
			myblock = true;
		}
		var blockwavesfees=0;

        block.transactions.forEach(function(transaction)
        {
            // type 8 are leasing tx
            if (transaction.type === 8 && ((transaction.recipient === config.address)|| (myAliases.indexOf(transaction.recipient) > -1) )){
                transaction.block = block.height;
                myLeases[transaction.id] = transaction;
            } else if (transaction.type === 9 && myLeases[transaction.leaseId]) { // checking for lease cancel tx
                transaction.block = block.height;
                myCanceledLeases[transaction.leaseId] = transaction;
            }

			if(myblock)
			{
                // considering Waves fees
                if (!transaction.feeAsset || transaction.feeAsset === '' || transaction.feeAsset === null)
                {
                    if(transaction.fee < 200000000) // if tx waves fee is more dan 2 waves, filter it. probably a mistake by someone
                    {
                        //wavesFees += (transaction.fee*0.4);
                        blockwavesfees += transaction.fee;

                    } else {
                        console.log("Filter TX at block: " + block.height + " Amount: " +  transaction.fee)
                    }
                } else if (block.height > 1090000 && transaction.type === 4) {
                blockwavesfees += 100000;
		  }

			}
      });
      wavesFees += Math.round(parseInt(blockwavesfees / 5) * 2);

      blockwavesfees=0;

      if(checkprevblock)
      {
        if (index > 0)
        {
            //console.log("Next: " + blocks[index + 1]);
            var prevblock = blocks[index - 1];
            prevblock.transactions.forEach(function(transaction)
            {
                // considering Waves fees
                if (!transaction.feeAsset || transaction.feeAsset === '' || transaction.feeAsset === null) {
              	if(transaction.fee < 200000000) // if tx waves fee is more dan 2 waves, filter it. probably a mistake by someone
              	{
                  	//wavesFees += (transaction.fee*0.6);
                  	blockwavesfees += transaction.fee;
                } else {
  			        console.log("Filter TX at block: " + block.height + " Amount: " +  transaction.fee)
  		        }
            } else if (block.height > 1090000 && transaction.type === 4) {
                blockwavesfees += 100000;
	      }

            });
        }

      wavesFees += (blockwavesfees - Math.round(parseInt(blockwavesfees / 5) * 2));

      }

        block.wavesFees = wavesFees;

    });
};

/**
 * Method that returns all relevant blocks.
 *
 * @returns {Array} all relevant blocks
 */
var getAllBlocks = function() {
    // leases have been resetted in block 462000, therefore, this is the first relevant block to be considered
    //var firstBlockWithLeases=462000;
    //var currentStartBlock = firstBlockWithLeases;
    var blocks = [];

    while (currentStartBlock < config.endBlock) {
        var currentBlocks;

        if (currentStartBlock + 99 < config.endBlock) {
            console.log('getting blocks from ' + currentStartBlock + ' to ' + (currentStartBlock + 99));
            currentBlocks = JSON.parse(request('GET', config.node + '/blocks/seq/' + currentStartBlock + '/' + (currentStartBlock + 99), {
                'headers': {
                    'Connection': 'keep-alive'
                }
            }).getBody('utf8'));
        } else {
            console.log('getting blocks from ' + currentStartBlock + ' to ' + config.endBlock);
            currentBlocks = JSON.parse(request('GET', config.node + '/blocks/seq/' + currentStartBlock + '/' + config.endBlock, {
                'headers': {
                    'Connection': 'keep-alive'
                }
            }).getBody('utf8'));
        }
        currentBlocks.forEach(function(block)
        {
            if (block.height <= config.endBlock) {
                blocks.push(block);
            }
        });

        if (currentStartBlock + 100 < config.endBlock) {
            currentStartBlock += 100;
        } else {
            currentStartBlock = config.endBlock;
        }
    }

    return blocks;
};


/**
 * Method that returns all aliases for address.
 *
 * @returns {Array} all aliases for address
 */
var getAllAlias = function() {

						var AliasArr = [];
            var Aliases = JSON.parse(request('GET', config.node + '/alias/by-address/' + config.address, {
                'headers': {
                    'Connection': 'keep-alive'
                }
            }).getBody('utf8'));

        Aliases.forEach(function(alias)
        {
						 AliasArr.push(alias);
						 console.log(alias);
        });
    return AliasArr;
}

/**
 * This method distributes either Waves fees and MRT to the active leasers for
 * the given block.
 *
 * @param activeLeases active leases for the block in question
 * @param amountTotalLeased total amount of leased waves in this particular block
 * @param block the block to consider
 */
var distribute = function(activeLeases, amountTotalLeased, block) {

    var fee = block.wavesFees;

    for (var address in activeLeases) {

	if ( nofeearray.indexOf(address) == -1 ) {	// leaseaddress is not marked as 'no pay address'
		var share = (activeLeases[address] / amountTotalLeased);
		var payout = true;
	} else {
		var share = (activeLeases[address] / amountTotalLeased);
		var payout = false;
	  }

        var amount = fee * share;

        var assetamounts = [];


        var amountMRT = share * config.distributableMrtPerBlock;

       	if (address in payments) {
       		payments[address] += amount * (config.percentageOfFeesToDistribute / 100);
       		mrt[address] += amountMRT;
	} else {
		payments[address] = amount * (config.percentageOfFeesToDistribute / 100);
		mrt[address] = amountMRT;
	}

	if ( payout == true ) {
        	console.log(address + ' will receive ' + amount + ' of(' + fee + ') and ' + amountMRT + ' MRT for block: ' + block.height + ' share: ' + share);
	} else if ( payout == false ) {
		console.log(address + ' marked as NOPAYOUT, will not receive fee share.');
	}
    }
};

/**
 * Method that creates the concrete payment tx and writes it to the file
 * configured in the config section.
 */
var pay = function() {
    var transactions = [];
    var totalMRT = 0;
    var totalfees =0;

    var html = "";

    var html = "<!DOCTYPE html>" +
"<html lang=\"en\">" +
"<head>" +
"  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
"  <link rel=\"stylesheet\" href=\"https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css\">" +
"  <script src=\"https://ajax.googleapis.com/ajax/libs/jquery/3.2.1/jquery.min.js\"></script>" +
"  <script src=\"https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js\"></script>" +
"</head>" +
"<body>" +

"<div class=\"container\">" +
"  <h3>Fee's between blocks " + config.startBlockHeight + " - " + config.endBlock + ", Payout #" + config.paymentid + "</h3>" +
"  <h4>(LPOS address: " + config.address + ")</h4>" +
"  <h5>29-06-2017: Hi all, again a short update of the fee's earned by the bearwaves node. Automated distribution, riding on BearWaves $BEAR. Cheers!</h5> " +
"  <h5>You can always contact us by <a href=\"mailto:bearwaves@outlook.com\">E-mail</a> or in Waves Slack @w0utje <img src=\"https://www.bearwaves.nl/wp-content/uploads/2017/08/banksy.jpg\" style=\"width:50px;height:50px;\"></h5>" +
"  <h5>Blocks forged: " + BlockCount + "</h5>" +
"  <table class=\"table table-striped table-hover\">" +
"    <thead> " +
"      <tr>" +
"        <th>Address</th>" +
"        <th>Waves</th>" +
"        <th>MRT</th>" +
"        <th>Mercury</th>" +
"        <th>Ripto Bux</th>" +

"      </tr>" +
"    </thead>" +
"    <tbody>";

    for (var address in payments) {
        var payment = (payments[address] / Math.pow(10, 8));

	if ( nofeearray.indexOf(address) == -1 ) {

		console.log(address + ' will receive ' + parseFloat(payment).toFixed(8) + ' and ' + parseFloat(mrt[address]).toFixed(2) + ' MRT!')

		//send Waves fee
		if (Number(Math.round(payments[address])) > 0) {
			transactions.push({
				"amount": Number(Math.round(payments[address])),
				"fee": config.feeAmount,
				//"feeAssetId": config.assetFeeId,
				"sender": config.address,
				"attachment": config.paymentAttachment,
				"recipient": address
			});
		}

		//send MRT
		if (Number(Math.round(mrt[address] * Math.pow(10, 2))) > 0) {
			transactions.push({
				"amount": Number(Math.round(mrt[address] * Math.pow(10, 2))),
				"fee": config.feeAmount,
				//"feeAssetId": config.assetFeeId,
				"assetId": "4uK8i4ThRGbehENwa6MxyLtxAjAo1Rj9fduborGExarC",
				"sender": config.address,
				"attachment": config.paymentAttachment,
				"recipient": address
			});
		}

	} else {
		console.log(address + ' marked as NOPAYOUT, will not receive fee share.')
	  }

        totalMRT += mrt[address];
        totalfees += payments[address];


        html += "<tr><td>" + address + "</td><td>" + 							 	//address column
				((payments[address]/100000000).toFixed(8)) + "</td><td>" + 	//Waves fee's
				mrt[address].toFixed(2) + "</td><td>" +                     //MRT
				"\r\n";
    }	//End for loop

    html += "<tr><td><b>Total</b></td><td><b>" + ((totalfees/100000000).toFixed(8)) +
		 "</b></td><td><b>" + totalMRT.toFixed(2) + "</b></td><td><b>" +
			"\r\n";

    html += "</tbody>" +
"  </table>" +
"</div>" +

"</body>" +
"</html>";

    console.log("total fees: " + (totalfees/100000000) + " total MRT: " + totalMRT );
    var paymentfile = config.filename + config.paymentid + ".json";
    var htmlfile = config.filename + config.paymentid + ".html";

//if ( !BlockCount == 0 ) { transactions.push( { "forgedblocks:": BlockCount } ) }

    fs.writeFile(paymentfile, JSON.stringify(transactions), {}, function(err) {
	if (!err) {
		console.log('Planned payments written to ' + paymentfile + '!');
	} else {
		console.log(err);
	  }
    });

    fs.writeFile(htmlfile, html, {}, function(err) {
	if (!err) {
		console.log('HTML written to ' + config.filename + config.paymentid  + '.html!');
	} else {
		console.log(err);
	  }
    });
   
    // Create logfile with paymentinfo for reference and troubleshooting 
    fs.writeFile(config.filename + config.paymentid + ".log", "total fees: " + (totalfees/100000000) + " total MRT: " + totalMRT + "\n"
	+ "Total blocks forged: " + BlockCount + "\n"
	+ "Payment ID of batch session: " + config.paymentid + "\n"
	+ "Payment startblock: " + paymentstartblock + "\n"
	+ "Payment stopblock: " + paymentstopblock + "\n"
	+ "Following addresses are skipped for payment; \n"
	+ JSON.stringify(nofeearray) + "\n", function(err) {
   	if (!err) {
        	    console.log('Summarized payoutinfo is written to ' + config.filename + config.paymentid + ".log!");
		    console.log();
        } else {
            console.log(err);
	  }
    	});
    // End create logfile

    var latestblockinfo = {};
    latestblockinfo["leases"]=myLeases;
    latestblockinfo["canceledleases"]=myCanceledLeases;
    var blockleases = config.endBlock + "_" + config.address + ".json" ;

    fs.writeFile(blockleases, JSON.stringify(latestblockinfo), {}, function(err) {
        if (!err) {
            console.log('Leaseinfo written to ' + blockleases + '!');
        } else {
            console.log(err);
        }
    });

    
    var ActiveLeaseData = getActiveLeasesAtBlock(LastBlock);

    fs.writeFile("LastBlockLeasers.json", JSON.stringify(ActiveLeaseData), {}, function(err) {
        if (!err) {
            console.log('ActiveLeasers written to LastBlockLeasers.json!');
        } else {
            console.log(err);
        }
    });
    
   // Write the current payid of the batch to the payment queue file. This is used by the masspayment tool
   let paymentqueue = function (callback) {

         payarray = [ ];

         if ( fs.existsSync(payqueuefile) == false ) {  //There is no paymentqueue file!

                console.log("\nApparently there's no paymentqueue file yet. Adding paymentid '" + payid + "' of current batch to queuefile " + payqueuefile);
		console.log("You can now either start the next collector session, when finished it will automatically be added to the payment queue.");
		console.log("You can also verify the payment queue with the payment check tool (checkPayment.js). All pending payments are");
		console.log("automatically found and checked.");
		console.log("Or you can run the payment tool (masspayment.js), which automatically executes the transactions to all leasers for all");
		console.log("jobs in the payment queue. Whenever a job is finished, it is automatically removed from the payment queue file.\n");

                payarray = [ payid ];

         } else {       // there is a paymentqueue file!

                rawarray = fs.readFileSync(payqueuefile, function(err, data)  { //read it into array
                        if (err) { console.log("\nWARNING! Error reading paymentqueue file. terminating tool. Run batch " + payid + " again.\n");return; }
                });
                payarray = JSON.parse(rawarray); //read it into array

                //case 1. It's empty
                if ( payarray.length == 0 ) {
                        console.log("\nCurrently there are no payments pending in the queue.");
                        console.log("Adding paymentid '" + payid + "' to queuefile " + payqueuefile + ". This is the only payment in the queue now :-)\n");
			console.log("You can now either start the next collector session, when finished it will automatically be added to the payment queue.");
			console.log("You can also verify the payment queue with the payment check tool (checkPayment.js). All pending payments are");
			console.log("automatically found and checked.");
			console.log("Or you can run the payment tool (masspayment.js), which automatically executes the transactions to all leasers for all");
			console.log("jobs in the payment queue. Whenever a job is finished, it is automatically removed from the payment queue file.\n");
 
                        payarray = [ payid ]
                }
                //case 2. It's not empty, but has paymentid duplicates waiting
                else if ( payarray.includes (payid) == true ) {

                        console.log("\nWARNING! Found paymentid " + payid + " already in queue. This means there has already ran a batch with this id,\n"
                                   +"for which payments were not done yet. If you expect this because you used the old batchinfo file again, then it's fine.\n"
                                   +"The paymentqueue stays the same and has following payments waiting [" + payarray + "]. The batchinfo that was used in current run is:\n");
                        console.log(mybatchdata);
	                console.log("\nYou can verify the actual payments that will be done in a dry run first by starting the checkPaymentsFile.js script.");
                        console.log("\nHowever, if you weren't expecting a job with same paymentid in the queue (which normally shouldn't), then check logs!!!\n");
                }
                //case 3. It's not empty. Add current batch to queue
                else {
                        console.log("\nFound " + payarray.length + " pending payments already in queue. Adding current batch with paymentid " + payid + " to the queue.")
                        payarray.push(payid);
                        console.log("The total queue waiting for payouts is now: " + payarray);
                }

           }

	nextpayid = payid + 1
	console.log("The next batch session will be '" + nextpayid + "'\n");

	fs.writeFileSync(payqueuefile, JSON.stringify(payarray), function (err)  {
		if (err) {
			console.log("\nWARNING! Error updating payment queue file. Terminating tool. Run batch " + payid + " again.\n");
			return;
		}
   	});
   	callback();
   };

   // update json batchdata for next collection round
   let nextbatchdata = function () {

	mybatchdata["paymentid"] = (payid + 1).toString()
	mybatchdata["paystartblock"] = (paymentstopblock).toString()
	mybatchdata["paystopblock"] = (paymentstopblock + blockwindowsize).toString()
	
	fs.writeFile(batchinfofile, JSON.stringify(batchinfo), (err) => {
		if (err) {
			console.log("Something went wrong updating the file:" + batchinfofile + "!");
			console.log(err);
		} else {
			console.log("Batchinfo for next payment round is updated in file " + batchinfofile + "!");
			console.log();
	  	  }
    	});
    };

    // update the paymentqueue and callback update batchdata function
    paymentqueue(nextbatchdata);
};

/**
 * This method returns (block-exact) the active leases and the total amount
 * of leased Waves for a given block.
 *
 * @param block the block to consider
 * @returns {{totalLeased: number, activeLeases: {}}} total amount of leased waves and active leases for the given block
 */
var getActiveLeasesAtBlock = function(block) {
    var activeLeases = [];
    var totalLeased = 0;
    var activeLeasesPerAddress = {};

    for (var leaseId in myLeases) {
        var currentLease = myLeases[leaseId];

        if (!myCanceledLeases[leaseId] || myCanceledLeases[leaseId].block > block.height) {
            activeLeases.push(currentLease);
        }
    }
    activeLeases.forEach(function (lease) {
        if (block.height > lease.block + 1000) {
            if (!activeLeasesPerAddress[lease.sender]) {
                activeLeasesPerAddress[lease.sender] = lease.amount;
            } else {
                activeLeasesPerAddress[lease.sender] += lease.amount;
            }

            totalLeased += lease.amount;
        }
    });

    return { totalLeased: totalLeased, activeLeases: activeLeasesPerAddress };
};

start();
