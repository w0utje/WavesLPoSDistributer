# WavesLPoSDistributer
A revenue distribution tool for Waves nodes

## Installation
First of all, you need to install Node.js (https://nodejs.org/en/) and NPM. Afterwards the installation of the dependencies could be done via:
```sh
mkdir node_modules
npm install
```
Once the dependencies are installed, the script that generates the payouts need to be configured. In order to do so, change the settings of the top section:
```sh
// Start my values
const myleasewallet = '<put your waves wallet address>';  //Your wallet address where all leases point
const myquerynode = "http://localhost:6869";  //Put reachability address of API access of the node you want to use for querying the waves blockchain. Defaults localnode
const feedistributionpercentage = 90;  //How many percentage of revenues to distribute. Defaults 90% 
const blockwindowsize = 50000;  //How many blocks are scanned in one batch for payments

// Put here wallet addresses that will receive no fees
// Could be wallets that award you with leases like the waves small node program
// var nofeearray = [ "3P6CwqcnK1wyW5TLzD15n79KbAsqAjQWXYZ",    //index0
//                    "3P9AodxBATXqFC3jtUydXv9YJ8ExAD2WXYZ" ];
var nofeearray = [ ];
// End my values

NOTE about distributionpercentage;
The default distribution of 'Mrt token' is put on 00. If you want to distribute Mrt to leasers, change value appropriate for number of tokens to divide;

var config = {
    distributableMrtPerBlock: 00,  //MRT distribution stopped
};

Then change 1 time the initial values to your needs in file 'batchinfo.json'. Default content is;
{
    "batchdata": {
        "attachment": "USkz6M7kM8X2vR89LHm48WnUK3YdBWV55W4RJ92y8jbV1XviPSzbTCdXWxtx",  <== Base58 encoded attachment message ("Thanks for leasing to plukkieforger :-)") 
        "paymentid": "1",             <== Can leave default. Used in the filenames that are created by the collectorscript
        "paystartblock": "1040000",   <== From which block should we start to consider payments
        "paystopblock": "1100000",    <== From which block should we stop scanning
        "scanstartblock": "1040000"   <== Where to start scanning. This is your first block with the first incoming lease to your wallet
    }
}

After the script succesfully finishes, 'the batchinfo.json' file is updated automatically for the next run. So it's a one time editing by hand for this file :-)
 
```
After a successful configuration of the tool, it could be started with:
```sh
node appng.js OR start_collector.sh

NOTE1
The script can consume a serious amount of memory and exists with errors during it's run.
Therefore I've put 'start_collector.sh' script as starter which runs 'node appng.js' with some memory optimized settings. 
For me it works with tweaks to 65KB of stack memory and 8GB of available RAM. So use 'start_collector.sh' if you run into problems.

NOTE2
To run the collector tool every night @1 AM, edit /etc/crontab and put (where the tool WavesLPoSDistributer is located in /home/myuser/...):
00 01 * * * root cd /home/myuser/WavesLPoSDistributer/ && ./start_collector.sh

```
After the tool ran, it finishes up by writing the actual payments to be done into the file which is configured in the script by:

var config = {
	filename: 'wavesleaserpayouts',

The name is constructed together with the paymentid of every  batch session. So, for the first run, the following Three files will be created;
- wavesleaserpayouts1.json
- wavesleaserpayouts1.html
- wavesleaserpayouts1.log

For the next session, the paymentid is incremented by 1
 
## Doing the payments
For the actual payout, the masspayment tool needs to be run. Before it could be started, it also needs to be configured:
```sh
/*
 Put your settings here:
 - filename: file to which the payments for the mass payment tool are written
 - node: address of your node in the form http://<ip>:<port>
 - apiKey: the API key of the node that is used for distribution
 */
var config = {
    filename: 'test.json',
    node: 'http://<ip>:<port>',
    apiKey: 'put the apiKey for the node here'
},
```
After configuration, the script could be started with:
```sh
node massPayment.js

After the payments have finished succesfully, you can move the three respective payoutfiles (i.e. wavesleaserpayouts1.json, wavesleaserpayouts1.json and wavesleaserpayouts1.log
to the dir 'paymentsDone' and keep them as reference. This also avoids accidental duplicate payments if you would run the masspayment tool again without changing the filename.

Next release I will change this behaviour by integrating some automaton here :-)
```
## Why two seperate tools?
We decided to use two seperate tools since this allows for additional tests of the payments before the payments are actually executed. On the other hand, it does not provide any drawback since both scripts could also be called directly one after the other with:
```sh
node apps.js && node massPayment.js
```
We strongly recommend to check the payments file before the actual payments are done. In order to foster these checks, we added the _checkPaymentsFile.js_ tool that could need to be configured as follows:
```sh
/**
 * Put your settings here:
 *     - filename: file to check for payments
 *     - node: address of your node in the form http://<ip>:<port
 */
var config = {
    filename: '',
    node: 'http://<ip>:<port>'
};
```
After the configuration the checking tool could be executed with:
```sh
node checkPaymentsFile.js
```
The output of the tool should provide an information about how man tokens of each asset will be paid by the payment script. After checking this information, you should be ready to execute the payments.
## Airdrops
Payments for airdrops could be calculated by using the _airdrop.js_ script. Configuration works pretty much the same way as for the other scripts:
```sh
/**
 * Put your settings here:
 *     - address: the address of your node that you want to distribute from
 *     - block: the block for which you want to calculate your richlist
 *     - total: amount of supply for the reference asset
 *     - amountToDistribute: amount of tokens that you want to distribute (have decimals in mind here...)
 *     - assetId: id of the reference asset
 *     - assetToDistributeId: id of the asset you want to airdrop
 *     - filename: name of the file the payments are written to
 *     - node: address of your node in the form http://<ip>:<port
 *     - excludeList: a list of addresses that should not receive the airdrop, e.g., exchanges...
 */
var config = {
    address: '',
    block: 500859,
    amountToDistribute: 35000000,
    assetId: '',
    assetToDistributeId: '',
    filename: '',
    node: '',
    excludeList: []
};
```
Afterwards, the script could be started with:
```sh
node airdrop.js
```

Payments for airdrops to leasers could be calculated by using the _airdrop_leasers.js_ script. Configuration works pretty much the same way as for the other scripts:
```sh
/**
 * Put your settings here:
 *     - address: the address of your node that you want to distribute from
 *     - total: amount of supply for the reference asset
 *     - amountToDistribute: amount of tokens that you want to distribute (have decimals in mind here...)
 *     - isStatic: boolean to select on which the sending amount is bases, true/false 
 *     			* true: every address receives amountToDistribute
 *     			* false: every address receives his percentage of amountToDistribute based on leased waves    
 *     - assetToDistributeId: id of the asset you want to airdrop
 *     - filename: name of the file the payments are written to
 *     - leasers: name of the file which contains the active leasers info, generated by app.js (LastBlockLeasers.json)
 *     - excludeList: a list of addresses that should not receive the airdrop, e.g., exchanges...
 */
var config = {
    address: '3PEFQiFMLm1gTVjPdfCErG8mTHRcH2ATaWa',
    amountToDistribute: 1,
    assetToDistributeId: '9gnc5UCY6RxtSi9FEJkcD57r5NBgdr45DVYtunyDLrgC', //BearWaves
    filename: 'airdrop_leasers.json',
    leasers: 'LastBlockLeasers.json',
    isStatic: true,
    excludeList: ["3P31zvGdh6ai6JK6zZ18TjYzJsa1B83YPoj"] //Bittrex
};
```
This example will generate the paymentfile airdrop_leasers.json for sending 1 BearWaves to every leaser in the LastBlockLeasers.json file.

Afterwards, the script could be started with:
```sh
node airdrop_leasers.js
```

## Disclaimer
Please always test your resulting payment scripts, e.g., with the _checkPaymentsFile.js_ script!
