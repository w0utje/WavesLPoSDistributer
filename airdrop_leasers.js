var syncRequest = require('sync-request');
var fs = require('fs');

/**
 * Put your settings here:
 *     - address: the address of your node that you want to distribute from
 *     - total: amount of supply for the reference asset
 *     - amountToDistribute: amount of tokens that you want to distribute (have decimals in mind here...) use in combination with isStatic!
 *     - isStatic: boolean to select on which the sending amount is bases, true/false 
 *     			* true: every address receives amountToDistribute
 *     			* false: every address receives his percentage of amountToDistribute based on leased waves        
 *     - assetToDistributeId: id of the asset you want to airdrop
 *     - filename: name of the file the payments are written to
 *     - leasers: name of the file which contains the active leasers info 
 *     - excludeList: a list of addresses that should not receive the airdrop, e.g., exchanges...
 */
var config = {
    address: '',
    amountToDistribute: 1,
    assetToDistributeId: '9gnc5UCY6RxtSi9FEJkcD57r5NBgdr45DVYtunyDLrgC', //BearWaves
    filename: 'airdrop_leasers.json',
    leasers: 'LastBlockLeasers.json',
    isStatic: true,
    excludeList: ["3P31zvGdh6ai6JK6zZ18TjYzJsa1B83YPoj"] //Bittrex
};

var total = 0;
var payments = [];
var totalDistributed = 0;
var bearholders = {};

var totalLeased = 0;
var activeLeases = {};

/**
 * This method starts the overall process by first downloading the blocks,
 * preparing the necessary datastructures and finally preparing the payments
 * and serializing them into a file that could be used as input for the
 * masspayment tool.
 */
var start = function() {

if (fs.existsSync(config.leasers)) 
{
	console.log("reading" + config.leasers + " file");
	var data=fs.readFileSync(config.leasers);
	var leaseinfo=JSON.parse(data);
	totalLeased = leaseinfo["totalLeased"];
	activeLeases = leaseinfo["activeLeases"];

	//exclude addresses
    config.excludeList.forEach(function(excludeAddress) {
        activeLeases[excludeAddress] = 0;        
    });
		    total = checkTotalDistributableAmount(activeLeases);
		    startDistribute(activeLeases);

} else {
	console.log("ERR - No leasers file!");
}    
    
};

/**
 * Method that sums up the total supply of the reference asset.
 *
 * @param richlist the richlist for the reference asset
 * @returns {number} total supply of the reference asset
 */
var checkTotalDistributableAmount = function(richlist) {
    var total = 0;
    var leaserscount =0;
    for (var address in richlist) {
        var amount = richlist[address];

        leaserscount ++;
				total += amount;

    }
    console.log("total: " + (total / Math.pow(10, 8)));
		console.log("Leasers: " + leaserscount);


    return total;
};

/**
 * This method starts the distribution process by calculating the amount each address
 * should receive and storing the appropriate transaction.
 *
 * @param richlist the richlist for the reference asset
 */
var startDistribute = function(richlist) {
    var transactions = [];

    for (var address in richlist) {
        var amount = richlist[address];
				var percentage = 0;
				var amountToSend = 0;

				if(!config.isStatic) //airdrop amount based on richlist
				{        
            percentage = amount / total;
            amountToSend = Math.floor(config.amountToDistribute * percentage);
				 } else {  //airdrop amount is the same for each address
				    amountToSend = config.amountToDistribute;
				 }

            totalDistributed += Number(amountToSend);
            transactions.push({ address: address.substring(0, 35), amount: amountToSend });

    }

    sendToRecipients(transactions, 0);
    console.log('totally distributed: ' + totalDistributed);
};

/**
 * Method that writes the payments in the configured file.
 *
 * @param txList list of transactions that should be stored
 * @param index current index of the payments
 */
var sendToRecipients = function(txList, index) {
    var payment = {
        "amount": txList[index].amount,
        "fee": 100000,
        "assetId": config.assetToDistributeId,
        "sender": config.address,
        "attachment": "",
        "recipient": txList[index].address
    };

    if (txList[index].amount > 0) {
        payments.push(payment);
    }
    index++;
    if (index < txList.length) {
        sendToRecipients(txList, index);
    } else {
        fs.writeFile(config.filename, JSON.stringify(payments), {}, function(err) {
            if (err) {
                console.log(err);
            }
        });
    }
};

start();
