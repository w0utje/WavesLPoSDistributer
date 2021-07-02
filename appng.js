//////////////////////////////////////////////////
// Some comments
// Transaction type  8 : Lease
// Transaction type  9 : LeaseCancel
// Transaction type 16 : Invoke script
//                       - stateChanges
//                         - leases
//                         - leaseCancels
//                         - invokes
//                           - stateChanges
//                             - leases
//                             - leaseCancels
//////////////////////////////////////////////////

const configfile = 'config.json'
const appngrunfile = 'appng.run' 

var request = require('sync-request');
var fs = require('fs');

var date = (new Date())
date = date.getDate()+"-"+date.getMonth()+"-"+date.getFullYear()

if ( fs.existsSync(appngrunfile) ) {
	console.log("\nALERT:\n" +
                    "Found appng interruptionfile. Apparently appng was interupted abnormally last time!\n" +
                    "Normally if collector sessions run 100% fine, this alert should not be given.\n" +
                    "Check your logs and if everything is fine, delete the crashfile: '" + appngrunfile + "'\n" +
                    "\nGoodbye now!\n")
        process.exit() //Terminate
} else { fs.closeSync(fs.openSync(appngrunfile, 'w')) }

if (fs.existsSync(configfile)) { //configurationfile is found, let's read contents and set variables

	const rawconfiguration = fs.readFileSync(configfile)
	const jsonconfiguration = JSON.parse(rawconfiguration)

	toolconfigdata = jsonconfiguration['toolbaseconfig']
	paymentconfigdata = jsonconfiguration['paymentconfig']
	apiuris = jsonconfiguration['api_uris']

	//define all vars related to the payment settings
	var myquerynode = paymentconfigdata['querynode_api']
	var feedistributionpercentage = parseInt(paymentconfigdata['feedistributionpercentage'])
	var mrtperblock = paymentconfigdata['mrtperblock']
	var myleasewallet = paymentconfigdata['leasewallet']
	var attachment = paymentconfigdata['transactionattachment']
	var startscanblock = parseInt(paymentconfigdata['firstleaserblock'])
	var paymentstartblock = parseInt(paymentconfigdata['paystartblock'])
	var blockwindowsize = parseInt(paymentconfigdata['blockwindowsize'])
	var nofeearray = paymentconfigdata['nopayoutaddresses']
	var mailto = paymentconfigdata['mail']
	var blockrewardsharingpercentage = parseInt(paymentconfigdata['blockrewarddistributionpercentage'])
	//define all vars related to the tool settings
	var batchinfofile = toolconfigdata['batchinfofile']
	var payqueuefile = toolconfigdata['payqueuefile']
	var payoutfilesprefix = toolconfigdata['payoutfilesprefix']
	var minscfee = parseInt(toolconfigdata['txscfee'])
	var mintxfee = parseInt(toolconfigdata['txfee']) 
	var balancesuri = (apiuris['balances']).replace('{address}', myleasewallet)
}
else {
     console.log("\n Error, configuration file '" + configfile + "' missing.\n"
		+" Please get a complete copy of the code from github. Will stop now.\n");
     return //exit program
}

let generatingbalance = JSON.parse(request ( "GET", myquerynode + balancesuri, { json: true } ).body).generating //GET generating balance of wallet

if (fs.existsSync(batchinfofile)) {

   var rawbatchinfo = fs.readFileSync(batchinfofile);
   var batchinfo = JSON.parse(rawbatchinfo);
  
   mybatchdata = batchinfo["batchdata"];
   paymentstartblock = parseInt(mybatchdata["paystartblock"]); //block where to start payments
   paymentstopblock = parseInt(mybatchdata["paystopblock"]); //block UNTIL (tot) to get payments
   startscanblock = parseInt(mybatchdata["scanstartblock"]);
   payid = parseInt(mybatchdata["paymentid"]); 

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
   let lastblockheight = parseInt(JSON.parse(blockchainresponse.body).height) - 1 //Current blockchain height 
   let force_collector_start

   if (process.argv[2] === undefined ) { //check if force start argument is given
	force_collector_start = 'no' //normal appng start
   } else if (process.argv[2].indexOf('now') != -1) {
	force_collector_start = 'yes' //force collector start
   } else { force_collector_start = 'no' } //all the rest should not be as forced

   if (paymentstopblock > lastblockheight && force_collector_start === 'no' ) { //Stopblock  not reached yet, exit

	let blocksleft = paymentstopblock - lastblockheight
        console.log("\n Current blockheight is " + lastblockheight + ". Waiting to reach " + paymentstopblock + " for next collector round.")
        console.log(" This is approximaly in ~" + Math.round((blocksleft)/60) + " hrs (" + (Math.round((blocksleft/60/24)*100))/100 + " days).\n")
	console.log(" You can safely force collection start with argument '/now', i.e. 'node appng /now' if you do")
	console.log(" not want to wait. This will use lastblockheight " + lastblockheight + " as paymentstopblock.\n")
	
	fs.unlink(appngrunfile, (err) => { //All done, remove run file which is checked during startup
		if (err) {
			console.error(err)
                        return
                }
        })
        return;

   } else if (paymentstopblock > lastblockheight && force_collector_start === 'yes' ) { //Force collector start with current blockchain height
	   paymentstopblock = lastblockheight //Start collector with current blockheight as stop block
   }

   var backupbatchinfo = fs.writeFileSync(batchinfofile + ".bak",fs.readFileSync(batchinfofile)) //Create backup of batchdatafile

} 
else { //Did not find batchinfofile, so it's probably first collector run

	payid = 1
	paymentstopblock = startscanblock + blockwindowsize

	var batchinfo = { "batchdata" : {
				"paymentid" : payid,
				"scanstartblock" : startscanblock,
				"paystartblock" : paymentstartblock,
				"paystopblock" : paymentstopblock
					}
			}
	
	mybatchdata = batchinfo["batchdata"]

	console.log("\n Batchfile '" + batchinfofile + "' is missing. This seems to be the first collector session." +
		    "\n The collector will start with the following batch details:\n" +
		    "\n  - paymentID: " + payid +
		    "\n  - Start scanning from block: " + startscanblock +
		    "\n  - Scan till block: " + paymentstopblock +
		    "\n  - Blockwindowsize: " + blockwindowsize + " blocks" +
		    "\n  - First relevant payoutblock: " + paymentstartblock + "\n" +
		    " =============================================================================================\n");
}

var config = {
    address: myleasewallet,
    startBlockHeight: paymentstartblock,
    endBlock: paymentstopblock,
    distributableMrtPerBlock: mrtperblock,  //MRT distribution stopped
    filename: payoutfilesprefix, //.json added automatically
    paymentid: payid,
    node: myquerynode,
    //node: 'http://nodes.wavesnodes.com',
    assetFeeId: null, //not used anymore with sponsored tx
    feeAmount: parseInt(toolconfigdata.txbasefee),
    paymentAttachment: attachment, 
    percentageOfFeesToDistribute: feedistributionpercentage,
    percentageOfBlockrewardToDistribute: blockrewardsharingpercentage
};

var myLeases = {}; //object, gets all active lease transactions
var myCanceledLeases = {}; //object, gets all cancelled lease transactions

var currentStartBlock = startscanblock; //Which block to start scanning 

var fs=require('fs');
var prevleaseinfofile = config.startBlockHeight + "_" + config.address + ".json";
if (fs.existsSync(prevleaseinfofile))
{
	console.log("reading " + prevleaseinfofile + " file");
	var data=fs.readFileSync(prevleaseinfofile);
	var prevleaseinfo=JSON.parse(data);
	myLeases = prevleaseinfo["leases"]; //All lease transactions (type8), can be multiple for one sender
	myCanceledLeases = prevleaseinfo["canceledleases"]; //All leasecancels (type9), can be multiple for one sender
	currentStartBlock = config.startBlockHeight;
}

//do some cleaning
//After this, var myLeases has the active leasers left from our startblock
//All leasers that cancelled their lease are removed
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
var myForgedBlocks = []; //Array with all blocks that my node forged

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
    var blocks = getAllBlocks(); //array with all blocks and blockdata of current batch
    //console.log('preparing datastructures...');
    //prepareDataStructure(blocks);
    console.log('preparing payments...');

    myForgedBlocks.forEach(function(block) {

        if (block.height >= config.startBlockHeight && block.height <= config.endBlock) {
//console.log(block)

            var blockLeaseData = getActiveLeasesAtBlock(block);
            var activeLeasesForBlock = blockLeaseData.activeLeases;
            var amountTotalLeased = blockLeaseData.totalLeased;

            distribute(activeLeasesForBlock, amountTotalLeased, block);
            BlockCount++;
        }
    });

    pay();
    console.log("blocks forged: " + BlockCount);
};


/**
 * Method to find all lease and leasecancels in transaction type16 statechanges
 * params:
 * - type16txs : transaction object (JSON)
 */
var get_type16_invoke_leases = function (type16txs) {
	
	//NOTE: prop is the key name
	//NOTE: type16txs[prop] is the value
	for ( prop in type16txs) {

		if (prop == 'stateChanges' && prop.length > 0) { //Check leases, leasecancels and invokes

			let la = type16txs[prop]['leases'] //lease array
			let lca = type16txs[prop]['leaseCancels'] //leasecancel array
			let ia = type16txs[prop]['invokes'] //invoke script array

			if ( la.length > 0 ) { //Lease transactions found

				// For every lease activation found in array leases, add lease to myLeases array
				la.forEach(function(lease) {
					if ( (lease.recipient === config.address) || (myAliases.indexOf(lease.recipient) > -1) ) {
						lease.block = lease.height
						lease.type = 16 //Add type 16 key informational, cause that info is missing in lease object
						myLeases[lease.id] = lease; //Add transaction id with transaction data to mylease array
					}
				});
			} 
			if ( lca.length > 0 ) { //Lease cancel transactions found

				// For every lease cancel found in array leaseCancel, add leasecancel to myCancelledLeases array
				lca.forEach(function(leasecancel) {
					if ( myLeases[leasecancel.id] ) { //Leasecancel id found in active lease array
						leasecancel.block = leasecancel.height
						leasecancel.type = 16//Add type 16 key informational, cause that info is missing in lease object
						myCanceledLeases[leasecancel.id] = leasecancel; //Add transaction id with transaction data to mycancel lease array
					}
				});
			}

			if (ia.length > 0) { //Found invokes data, check repeat function with new object data

				ia.forEach(function(object,i) { //Loop through invoke array to find 'stateChanges' object

					if ( 'stateChanges' in ia[i] ) {
						get_type16_invoke_leases(ia[i]); //start function again with new invoke json object
					}
					
				});
			}
		}
	}
}


/**
 * Method that returns all relevant blocks in batches of 100.
 * One batch is scanned for lease activations, lease cancels and if my node forged the block
 * My forged blocks are pushed to array myforgedBlocks[] for later usage and waves fees
 * are collected for transactions that are needed for lease sharing.
 * The fees in the previous block are also needed related to the forged block
 * New leases are added to array myLeases[], with block height and transaction data
 * Cancelled leases are added to array myCanceledLeases[], with block height and transaction data
 *
 * @returns {Array} all relevant blocks
 */
var getAllBlocks = function() {

    // leases have been resetted in block 462000, therefore, this is the first relevant block to be considered

    var cnt=0; //while loop, block counter
    var checkprevblock = false;
    var keeplastblock = {};
    var currentBlocks = []; //array with the block data

    //Grab blocks in batches of 100
    //start from currentstartblock (defined in batchinfo.json)
    //stop at endblock (defined in batchinfo.json)
    while (currentStartBlock < config.endBlock) { //START loop to get all blocks

	var lastblockincurrentblocks;

	if (cnt>0) { keeplastblock = currentBlocks.slice(-1)[0] } //Set the last block as available as previous block for the next batch collection

        if (currentStartBlock + 99 < config.endBlock) {
            console.log('getting blocks from ' + currentStartBlock + ' to ' + (currentStartBlock + 99));
            currentBlocks = JSON.parse(request('GET', config.node + '/blocks/seq/' + currentStartBlock + '/' + (currentStartBlock + 99), {
                'headers': {
                    'Connection': 'keep-alive'
                }
            }).getBody('utf8'));
	    lastblockincurrentblocks = currentStartBlock + 99;
        } else {
            console.log('getting blocks from ' + currentStartBlock + ' to ' + config.endBlock);
            currentBlocks = JSON.parse(request('GET', config.node + '/blocks/seq/' + currentStartBlock + '/' + config.endBlock, {
                'headers': {
                    'Connection': 'keep-alive'
                }
            }).getBody('utf8'));
	    lastblockincurrentblocks = config.endBlock;
        }

        currentBlocks.forEach(function(block, index) { //For each block within the batch of 100 blocks

		var myblock = false;
        	var wavesFees = 0;
		var blockrewards = 0;
		var blockwavesfees=0;

            	if (block.height <= config.endBlock) { //Block height falls within collect range

			if (block.generator === config.address) { //My node is the generator of the block
				myblock = true;
				if (cnt>0) { checkprevblock = true } //Do not check previous block if this is the startblock
			}

			catch_relevant_blocks(index, block, myblock, wavesFees, blockwavesfees, checkprevblock, currentBlocks, keeplastblock); //Catch new lease, cancels and fees
			
            	}

		cnt++ //Overall block counter
		checkprevblock = false
        });
	
        if (currentStartBlock + 100 < config.endBlock) { //Check if another batch should be done
            currentStartBlock += 100; //Increase with 100 to start next collection

        } else { //Done collecting, escape from while loop
	    LastBlock = currentBlocks.slice(-1)[0] //Save last block content
            currentStartBlock = config.endBlock; //Startblock=endblock, finished, Escape from loop
        }

    } //END while loop to get all blocks

};


/**
 * Method that scans the block for lease activations and cancellations
 * It adds some data to the block and pushes it to relevant block array
 */
var catch_relevant_blocks = function (index, block, myblock, wavesFees, blockwavesfees, checkprevblock, currentBlocks, keeplastblock) {

	// Scan through all transactions in a block and catch lease activations, cancellations and waves fees
	// 1.  grep type8 lease transactions that are targetted to my node address
	// 2.  grep type9 leaseCancel transactions that are matched in my node lease array with active lease transactions
	// 3.  grep type16 transactions
	// 3.1  - grep statechanges -> lease that are targetted to my node address
	// 3.2  - grep statechanges -> invokes -> statechanges -> lease  that are targetted to my node address
	// 3.3  - grep statechanges -> leaseCancel that are matched in my node lease array with active lease transactions
	// 3.4  - grep statechanges -> invokes -> statechanges -> leaseCancel that are matched in my node lease array with active lease transactions
	//
	// NOTE
	// - All blocks need to be scanned for lease/leasecancel transactions to your node
	// - Only blocks that mynode secured need to be scanned for fees
	//

	block.transactions.forEach(function(transaction) {

            		// type 8 is leasing tx
			// AND if the node address (recipient) is my node or the alias is used and is mynode's name
            		if (transaction.type === 8 && ((transaction.recipient === config.address)|| (myAliases.indexOf(transaction.recipient) > -1) )){
                		transaction.block = block.height; //Add key block and set blockheight
                		myLeases[transaction.id] = transaction; //Add transaction id to mylease array

			// type 9 is leaseCancel tx
			// AND the lease transaction is found in my array of active leases
            		} else if (transaction.type === 9 && myLeases[transaction.leaseId]) {
                		transaction.block = block.height; //Add key block and set blockheight
                		myCanceledLeases[transaction.leaseId] = transaction; //Add transaction leaseid to array with cancelled leases

			// type 16 with lease and leasecancels by invocation script execution with stateChanges
            		} else if (transaction.type === 16 && transaction.hasOwnProperty('stateChanges')) { //Type16 and toplevel key 'stateChanges' is present

					get_type16_invoke_leases(transaction); //Get all lease & leasecancel transactions from stateChanges & invoke dApps
			}

			if(myblock) { //The collected block is generated by my node, collect the fees for the transactions

                		// considering Waves fees
                		if (!transaction.feeAsset || transaction.feeAsset === '' || transaction.feeAsset === null) { //This is a Waves transaction
                    			if(transaction.fee < 200000000)  { // if tx waves fee is more dan 2 waves, filter it. probably a mistake by someone
                        			//wavesFees += (transaction.fee*0.4);
                        			blockwavesfees += transaction.fee; //Add up all the Waves transaction fees
                    			} else {
                        			console.log("Filter TX at block: " + block.height + " Amount: " +  transaction.fee) //Do not add up waves fees
                    			}
                		} else if (block.height > 1090000 && transaction.type === 4) { //Waves Transfer transaction
                				blockwavesfees += mintxfee; //Add up Waves minimum fee
		  		}
			}

	});

      wavesFees += Math.round(parseInt(blockwavesfees / 5) * 2); //Total Waves fees for the block
      blockwavesfees=0; //Reset fee counter for the block

      if (checkprevblock) { //Need to collect fees from previous block
		if (index === 0) { //Check fees from old copy, that was kept from previous cycle of blocks
			prevblock = keeplastblock;
		} else {
			prevblock = currentBlocks[index - 1]; //Check fees from current cycle of blocks
		}
            	prevblock.transactions.forEach(function(transaction) {
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
                		blockwavesfees += mintxfee;
	      		}
            	});

      		wavesFees += (blockwavesfees - Math.round(parseInt(blockwavesfees / 5) * 2));
      }

      wavesFees = ( wavesFees * config.percentageOfFeesToDistribute / 100 ) //These are the Txs fees with sharing % applied from configfile

      if (myblock) {  //This block is written by my waves node
	        // This is the blockreward amount with sharing % applied from configfile
		if (block.height >= 1740000) { wavesFees += ( block.reward * blockrewardsharingpercentage ) / 100 } //Feature 14 activated at 1740000
      }
      
      block.wavesFees = wavesFees; //Set sum of all transaction fees for this block

      if (myblock) { myForgedBlocks.push(block) } //Push my forged block to array which has all my forged blocks

}


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

    var fee = block.wavesFees; //total waves fee amount + blockreward with sharing % from configfile applied

    for (var address in activeLeases) {

	if ( nofeearray.indexOf(address) == -1 ) {	// leaseaddress is not marked as 'no pay address'
		var share = (activeLeases[address] / amountTotalLeased); //what is the share ratio for this address
		var payout = true;
	} else {					//this address will not get payed
		var share = (activeLeases[address] / amountTotalLeased); //what is the share ratio for this address
		var payout = false;
	  }

        var amount = fee * share; //The Waves amount per address according ratio

        var assetamounts = [];


        var amountMRT = share * config.distributableMrtPerBlock; //How many Mrt will the address get

       	if (address in payments) { //Address already in array, add to amount
       		payments[address] += amount //How many Waves fees leaser gets
       		mrt[address] += amountMRT; //How many Mrt leaser gets
	} else { //Address not yet in array, add entry
		payments[address] = amount; //How many Waves fees leaser gets
		mrt[address] = amountMRT; //How many Mrt leaser gets
	}

	if ( payout == true ) {
        	console.log(address + ' will receive ' + amount + ' of ' + fee + ' Waves and ' + amountMRT + ' MRT for block: ' + block.height + ' share: ' + share);
	} else if ( payout == false ) {
		console.log(address + ' marked as NOPAYOUT: ' + amount + ' of(' + fee + ') and ' + amountMRT + ' MRT for block: ' + block.height + ' share: ' + share);
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
    var nopaywaves = 0
    var nopaymrt = 0
    var nopayaddresscount = 0

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
"  <h3>Fees between blocks " + config.startBlockHeight + " - " + config.endBlock + ", Payout #" + config.paymentid + ", (Share Tx fees " + config.percentageOfFeesToDistribute + "% / Blockreward " + config.percentageOfBlockrewardToDistribute + "%)</h3>" +
"  <h4>(LPOS address: " + config.address + ")</h4>" +
"  <h5>[ " + date + " ]: Hi all, again a short update of the fee's earned by the wavesnode 'Plukkieforger'. Greetings!</h5> " +
"  <h5>You can always contact me by <a href=\"mailto:" + mailto + "\">E-mail</a></h5>" +
"  <h5>Blocks forged: " + BlockCount + "</h5>" +
"  <table class=\"table table-striped table-hover\">" +
"    <thead> " +
"      <tr>" +
"        <th>Address</th>" +
"        <th>Waves</th>" +
"        <th>MRT</th>" +

"      </tr>" +
"    </thead>" +
"    <tbody>";

    for (var address in payments) { //Start for all addresses in payments array
        var payment = (payments[address] / Math.pow(10, 8));

	if ( nofeearray.indexOf(address) == -1 ) { //This address will get payed (it's not found in nopay array)

		payout = true

		console.log(address + ' will receive ' + parseFloat(payment).toFixed(8) + ' Waves and ' + parseFloat(mrt[address]).toFixed(2) + ' MRT in total!')

		//send Waves fee
		if (Number(Math.round(payments[address])) > 0) {
			transactions.push({
				"amount": Number(Math.round(payments[address])),
				"fee": config.feeAmount,
				//"feeAssetId": config.assetFeeId,
				"sender": config.address,
				"attachment": config.paymentAttachment,
				"recipient": address,
				"pay" : "yes"
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
				"recipient": address,
				"pay" : "yes"
			});
		}

	} else { //NOPAYOUT address, will not get payed

		payout = false
		nopayaddresscount ++

		console.log(address + ' marked as NOPAYOUT, will not receive ' + parseFloat(payment).toFixed(8) + ' and ' + parseFloat(mrt[address]).toFixed(2) + ' MRT!')

		//send Waves fee
                if (Number(Math.round(payments[address])) > 0) {
			nopaywaves += payments[address]
                        transactions.push({
                                "amount": Number(Math.round(payments[address])),
                                "fee": config.feeAmount,
                                //"feeAssetId": config.assetFeeId,
                                "sender": config.address,
                                "attachment": config.paymentAttachment,
                                "recipient": address,
				"pay" : "no"
                        });
                }

                //send MRT
                if (Number(Math.round(mrt[address] * Math.pow(10, 2))) > 0) {
			nopaymrt += mrt[address]
                        transactions.push({
                                "amount": Number(Math.round(mrt[address] * Math.pow(10, 2))),
                                "fee": config.feeAmount,
                                //"feeAssetId": config.assetFeeId,
                                "assetId": "4uK8i4ThRGbehENwa6MxyLtxAjAo1Rj9fduborGExarC",
                                "sender": config.address,
                                "attachment": config.paymentAttachment,
                                "recipient": address,
				"pay" : "no"
                        });
                }

	  }

        totalMRT += mrt[address];
        totalfees += payments[address];


        html += "<tr><td>" + address + "</td><td>" + 							 	//address column
				((payments[address]/100000000).toFixed(8)) + "</td><td>" + 	//Waves fee's
				mrt[address].toFixed(2) + "</td><td>"                      //MRT
	
	if (payout == false) { html += "* NO PAYOUT *" }
	
	html += "\r\n";

    }	//End for all addresses in payments array

    html += "<tr><td><b>Total amount</b></td><td><b>" + ((totalfees/100000000).toFixed(8)) +
		 "</b></td><td><b>" + totalMRT.toFixed(2) + "</b></td><td><b>" +
			"\r\n";

    if (nopaywaves != 0) { //Write no payout row
    	html += "<tr><td><b>No Payout amount (" + nopayaddresscount + " recipients)</b></td><td><b>" + ((nopaywaves/100000000).toFixed(8)) +
		"</b></td><td><b>" + nopaymrt.toFixed(2) + "</b></td><td><b>" +
			"\r\n";
    }

    html += "</tbody>" +
"  </table>" +
"</div>" +

"</body>" +
"</html>";


    console.log("total Waves shared (fees + blockrewards): " + (totalfees/100000000).toFixed(8) + " (" + config.percentageOfFeesToDistribute + "%/" + config.percentageOfBlockrewardToDistribute + "%) + total MRT: " + totalMRT );
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
    fs.writeFile(config.filename + config.paymentid + ".log",
	"total Waves fees: " + (totalfees/100000000).toFixed(8) + " total MRT: " + totalMRT + "\n"
	+ "Total blocks forged: " + BlockCount + "\n"
	+ "Active leasers: " + Object.keys(myLeases).length + "\n"
	+ "Generating balance: " + Math.round(generatingbalance / Math.pow(10, 8)) + "\n"
	+ "NO PAYOUT Waves: " + (nopaywaves/100000000).toFixed(8) + "\n"
	+ "NO PAYOUT MRT: " +  nopaymrt.toFixed(2) + "\n"
	+ "Payment ID of batch session: " + config.paymentid + "\n"
	+ "Payment startblock: " + paymentstartblock + "\n"
	+ "Payment stopblock: " + paymentstopblock + "\n"
	+ "Distribution: " + paymentconfigdata.feedistributionpercentage + "%\n"
	+ "Blockreward sharing: " + blockrewardsharingpercentage + "%\n"
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

		console.log("\nApparently there's no payment queue file yet. Adding paymentid '" + payid + "' of current batch to queuefile " + payqueuefile);
		console.log("You can now either start the next collector session, when finished it will automatically be added to the payment queue.");
                console.log("Or you can verify the payment queue with the payment check tool ('start_checker' or 'node checkPayment.js').");
                console.log("All pending payments are automatically found and checked.");
		console.log("Then execute the actual payments, which transfers the revenue shares to all leasers. Start with 'node masstx'.");
		console.log("When the pay job is finished, it is automatically removed from the payment queue file.\n")

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
                        console.log("Or you can verify the pending payment with the payment check tool, 'node checkPaymentsFile.js'.");
			console.log("This will only check, not pay!");
                	console.log("If you are satisfied with the checker results (you probably are), then execute the actual payment with 'node masstx'");
			console.log("This will transfer the revenue shares to all leasers!")
                	console.log("When the payment is finished, the job id is automatically removed from the payment queue file.\n")
 
                        payarray = [ payid ]
                }
                //case 2. It's not empty, but has paymentid duplicates waiting
                else if ( payarray.includes (payid) == true ) {

                        console.log("\nWARNING! Found paymentid " + payid + " already in queue. This means there has already ran a batch with this id,\n"
                                   +"for which payments were not done yet. If you expect this because you used the old batchinfo file again, then it's fine.\n"
				   +"However, if you weren't expecting a job with same paymentid in the queue (which normally shouldn't), then check logs!!!\n"
                                   +"The paymentqueue stays the same and has following payments waiting: [" + payarray + "].\n"
				   +"\nThe batchinfo that was used in the current run is:\n")
			console.log(mybatchdata)
			console.log("\nYou can verify the actual payments that will be done in a dry run first by starting the checkPaymentsFile.js script.\n")
                }
                //case 3. It's not empty. Add current batch to queue
                else {
                        console.log("\nFound " + payarray.length + " pending payments already in queue. Adding current batch with paymentid " + payid + " to the queue.")
                        payarray.push(payid);
                        console.log("The total queue waiting for payouts is now: " + payarray);
			console.log("\nTIP")
			console.log("Before you execute your payments, you can lower the needed transaction costs,");
			console.log("by running the optimizer tool, './txoptimizer.py'.")
			console.log("This will merge all pending payments in one larger job!");
			console.log("Start first the checker tool: './start_checker.sh' or 'node checkPaymentsFile.js'");
			console.log("Then start the txoptimizer tool: 'txoptimizer.py' and see the optimized results!")
			console.log("To verify you can start checker tool afterwards again :-)\n")
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
			fs.unlink(appngrunfile, (err) => { //All done, remove run file which is checked during startup
                		if (err) {
                        		console.error(err)
                        		return
                		}
        		})
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

    var activeLeases = []; //array with all leases that are active and possibly accountable for this block
    var totalLeased = 0;
    var activeLeasesPerAddress = {};

    for (var leaseId in myLeases) { //Scan through all last known active leases
        var currentLease = myLeases[leaseId];

        if (!myCanceledLeases[leaseId] || myCanceledLeases[leaseId].block > block.height) { //Lease is not cancelled or was set later then current block
            activeLeases.push(currentLease); //Push lease data to activeLeases array
        }
    }
    activeLeases.forEach(function (lease, index) { //Check if active leases are accountable for sharing

        if (block.height > lease.block + 1000) { //If the lease was at least activated 1000 blocks ago

            if (!activeLeasesPerAddress[lease.sender]) { //If leaser not in activeLeasesPerAddress yet
                activeLeasesPerAddress[lease.sender] = lease.amount; //Add the lease amount
            } else {
                activeLeasesPerAddress[lease.sender] += lease.amount; //Sum up the lease amounts
            }

            totalLeased += lease.amount; //total leased of all leasers for this block
        }
    });
//console.log(totalLeased)
    return { totalLeased: totalLeased, activeLeases: activeLeasesPerAddress };
};

start();
