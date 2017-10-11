var request = require('sync-request');
var fs = require('fs');

/**
 * Waves Node script for checking a payments file's transactions on blockchain
 * outputs the a payment file with missing payments 
 *    
 * Put your settings here:
 *     - address: the address of the sender on the blockchain to check
 *     - startBlockHeight: the block from which you want to start checking
 *     - endBlock: the block until you want to check
 *     - filename: file to which the payments for the mass payment tool are written  
 *     - node: address of your node in the form http://<ip>:<port
 *     - NewfeeAssetId: Change feeAssetId for missing payments file if enabled
 *     - ChangeAssetFee: true/false enable/disable changing feeAssetId on new payment file 
 */
var config = {
   	address: '3PEFQiFMLm1gTVjPdfCErG8mTHRcH2ATaWa',
    startBlockHeight: 696358,
    endBlock: 696393,
    filename: 'payment24', //.json added automatically
    node: 'http://nodes.wavesnodes.com',
    NewfeeAssetId: "5BK9HPKmSkxoMdqvDzneb2UaW2NzDRjoMpMvQWfB4NcK",
    ChangeAssetFee: false    
};


var currentStartBlock = config.startBlockHeight;
var payments = {};
var fs=require('fs');
var prevpaymentfile = config.filename + ".json";
if (fs.existsSync(prevpaymentfile)) 
{
	console.log("reading " + prevpaymentfile + " file");
	var data=fs.readFileSync(prevpaymentfile).toString();
	payments=JSON.parse(data);
}

   
var mytransactions = [];
var txcount = 0;
var txblocks = [];

/**
  * This method starts the overall process by first downloading the blocks,
  * preparing the necessary datastructures and outputting a new payment file
  * that could be used as input for the masspayment tool.
 */
var start = function() {
    console.log('getting blocks...');
    var blocks = getAllBlocks();
    console.log('preparing datastructures...');
    prepareDataStructure(blocks);

    console.log("transaction sent: " +txcount);
    console.log("in " + txblocks.length + " blocks");
    console.log("from " + txblocks[0].height + " to " + txblocks[txblocks.length-1].height);
    
    var missingtxs = [];
    
    payments.forEach(function(tx)
    {
        var checktx = tx.recipient + tx.assetId;
        if(tx.assetId===undefined)
        {
          checktx = tx.recipient;
        }
        
        var thisoneexists = false;
        var missingtx={};
        
        mytransactions.forEach(function(tx2)
        {
           //      0
           var payedtx = tx2.recipient + tx2.assetId;
          if(tx2.assetId===null)
          {
          payedtx = tx2.recipient;
          }           
           if((payedtx == checktx)&&(tx.amount==tx2.amount))
           {
              thisoneexists=true;
           }  
                 
        });
        
        if(!thisoneexists)
           {            
            if(config.ChangeAssetFee)
            {
              tx.feeAssetId = config.NewfeeAssetId;
            }
            missingtxs.push(tx);
           }           
        
    });
    console.log("needed to do: " + payments.length);
    console.log("actual did: " + mytransactions.length);
    console.log("missing: " + missingtxs.length);
    
    var paymentfile = config.filename + "_missing.json";
    fs.writeFile(paymentfile, JSON.stringify(missingtxs), {}, function(err) {
        if (!err) {
            console.log('missing payments written to ' + paymentfile + '!');
        } else {
            console.log(err);
        }
    });    
    
    
};

/**
 * This method organizes the datastructures that are later on necessary
 * for the block-exact analysis of the leases.
 *
 *   @param blocks all blocks that should be considered
 */
 
var prepareDataStructure = function(blocks) {
    blocks.forEach(function(block) {
        var thisblock = false;

        block.transactions.forEach(function(transaction) {

            if (transaction.type === 4 && transaction.sender === config.address) 
            {
                  transaction.block = block.height;
                  mytransactions.push(transaction);
                  txcount++;
                  thisblock=true;
            }           
        });
        
        if(thisblock)
        {
              txblocks.push(block);
        }
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
        currentBlocks.forEach(function(block) {
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

start();