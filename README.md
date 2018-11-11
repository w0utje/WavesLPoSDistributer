# WavesLPoSDistributer
A revenue distribution tool for Waves nodes
Welcome to Plukkies version of the LPoSdistribution script, 'the lazy' version,
which queues up multiple sessions and automates next session info :-)

Donations are welcome if you like this version of the script: 'The lazy' version
 * - you can send waves to wallet alias 'plukkie'
 * - you can send your lease to waves alias 'plukkieforger'

## Installation steps: prerequisits
First of all, you need to install Node.js (https://nodejs.org/en/) and NPM. This version is succesfully tested with versions;
 - node v10.12.0 (allthough lower should work probably)
 - npm 6.4.1 (allthough lower should work probably)
 - tested on Ubuntu 14.0 with kernel 4.4.0-116-generic (allthough of minor importance)
 - get the latest version from github: git clone https://github.com/plukkie/WavesLPoSDistributer.git

## Installation steps: first time users
These steps are for users that do not use older an version of the LPoSdistributer package yet.
1. CD into the LPoS package directory : WavesLPoSDistributer
2. install the package independencies:
```sh
mkdir node_modules
npm install
```
3. configure for one time only the initial settings of the relevant blocks in the batchinfo.json file:
```sh
EDIT file batchinfo.json with vim or nano;

{
    "batchdata": {
        "attachment": "NK2oQJzq7sjCvh7AjJcLjLT9Ax",	<== Put here a base58 encoded message (default is: "thanks for leasing!")
        "paymentid": "1",				<== Leave as is
        "paystartblock": "1044012",			<== Put here same value as 'scanstartblock'. It's when payouts should start
        "paystopblock": "1050000",			<== Put here a value when payouts should stop (i.e. paystopblock+5000)
							    It doesn't really matter, as long as it is higher than paystartblock.
							    It only counts for the first run, and if no blocks were forged yet, that
							    is no problem. Follow up session results are just queued up in line :-))
        "scanstartblock": "1044012"			<== Put here the blockheight when your first leaser came in
    }
}
```
   NOTE
   This file is updated automatically after the collector session finishes.
   The size of the next batch (paystart / paystop blocks), is used from the 'blockwindowsize'
   config value in the appng.js file.

4. EDIT file appng.js with vim or nano;
   This file is the collector that checks all blocks for leases and fees
```sh
const myleasewallet = '<your node wallet>';		<== Put here the address of the wallet that your node uses
const myquerynode = "http://localhost:6869";		<== The node and API port that you use (defaults to localhost)
const feedistributionpercentage = 90;			<== How many % do you want to share with your leasers (defaults to 90%)
const mrtperblock = 0;					<== How many MRT tokens per block do you want to share with your leasers (default 0)
const blockwindowsize = 10000;				<== How many blocks to process for every subsequent paymentcycle.

var nofeearray = [ ];					<== Put here wallet addresses that you want to exclude from payments,
							    Default empty, so everyone get's payouts
```
5. EDIT file checkPaymentsFile.js with vim or nano;
```sh
var config = {
    <SNIP>,
    node: 'http://localhost:6869',			<== Change this value to your blockchain node/API port (defaults to localhost)
    <SNIP>
};
```
6. EDIT file massPayment.js
```sh
var config = {
    <SNIP>,
    node: 'http://localhost:6869',			<== Change this value to your blockchain node/API port (defaults to localhost)
    apiKey: 'your api key'				<== Put here the API key of your Waves node
};
```
NOTE
For security reasons, remove 'rwx' worldrights from massPayment.js -> ```sh chmod o-rwx massPayment.js``` 
Now you can jump to chapter "Running the collector sessions"

## Installation steps: users that already use previous versions of LPoSdistributer script
If you use other version of the script, like from Marc jansen or w0utje, it's easy migration;

1. Finish up all payments
2. Rename directory of your current version to 'WavesLPoSDistributer.old'
3. If correct, you new version directory is called 'WavesLPoSDistributer'
   CD into the OLD version dir and copy following files to the NEW version dir;

   - LastBlockLeasers.json
   - The last leaserpayout info file, which looks like following;
     1250000_3P7vmba4wWLXq6t1G8VaoaVqbUb1dDp8gj4.json

     This name represents the "stopblock"_ from the last session + the wallet address of your node
4. Now CD into the NEW version directory
5. EDIT the batchinfo.json file with nano or vim;
```sh
{
    "batchdata": {
        "attachment": "NK2oQJzq7sjCvh7AjJcLjLT9Ax",     <== Put here a base58 encoded message (default is: "thanks for leasing!")
        "paymentid": "1",                               <== Leave as is
        "paystartblock": "<stopblock>",                 <== Put here the 'stopblock' value, see explained in bullet 3
        "paystopblock": "<stopblock+X",                 <== Put here a value when payouts should stop (i.e. paystopblock+5000)
                                                            It doesn't really matter, as long as it is higher than paystartblock.
                                                            It only counts for the first run, and if no blocks were forged yet, that
                                                            is no problem. Follow up session results are just queued up in line :-))
        "scanstartblock": "1044012"                     <== For best practise, you can put here the blockheight when your first leaser came in.
							    It's only needed when you would loose the last leaserpayoutfiles for some reason.
    }
}
```
6. Now follow steps explained earlier in 'Installation steps: first time users' but,
You should SKIP step 3 !!!

## Running the collector sessions
After a successful configuration of the tool, it could be started with:
```sh
node appng.js OR start_collector.sh
```
NOTE1
The script can consume a serious amount of memory and exists with errors during it's run.
Therefore I've put 'start_collector.sh' script as starter which runs 'node appng.js' with some memory optimized settings. 
For me it works with tweaks to 65KB of stack memory and 8GB of available RAM. So use 'start_collector.sh' if you run into problems.

NOTE2
To run the collector tool every night @1 AM, edit /etc/crontab and put (where the tool WavesLPoSDistributer is located in /home/myuser/...):
00 01 * * * root cd /home/myuser/WavesLPoSDistributer/ && ./start_collector.sh

After the tool ran, it finishes up by writing the actual payments to be done into the file which is configured in the script by:
```sh
var config = {
	filename: 'wavesleaserpayouts',
```
The name is constructed together with the paymentid (or batchID) of every batch session. So, for the first run, the following three files will be created;
- wavesleaserpayouts1.json
- wavesleaserpayouts1.html
- wavesleaserpayouts1.log

The batchID is added to the payqueue.dat file. When there are already pending payments, it's just added.
For the next session, the batchid is incremented by 1 and the batchdata.json file is updated with the new blockheights and batchID.

## Checking pending payments
After the collector ran (or ran multiple times as you wish), you can check the payments that are stored in the payment queue.
The script for checking is checkPaymentsFile.js. After you configured some settings (see above), you can start with;
```sh
node checkPaymentsFile.js
```
The script reads all all batchIDs from the payqueue.dat file and the corresponding leaser files that were constructed by the collector tool.
It does only checking, nothing else. The results for all pending payments is printed on the screen.
After checking this information, you have a good overview what tokens and the amounts are planned for payout!

## Doing the payments
For the actual payout, the massPayment.js tool needs to be run. It can be started with:
```sh
node massPayment.js
```
All batchIDs are sequencially read from the payment queue and the transactions are executed.
When a job finishes, the batchID is removed from the payqueue.dat and the three wavesleaserpayoutX.* files
are moved to the archival directory (paymentsDone/).

NOTE
If there would be a crash of the system, script or other transaction breaking interruption,
make note of the last succesfull transaction counter and the batchID. Then edit the massPayment.js
file and change these values for:
```sh
const crashconfig = {
        batchidstart: '0',		<== batchID here
        transactionstart: '0' }		<== last succesfull transaction +1
```
Then start the 'node massPayment.js'.
The values you can leave in or you can put it back to 0 / 0 if you like.

## Why three seperate tools?
We decided to use seperate tools since this allows for additional tests of the payments before the payments are actually executed.
On the other hand, it does not provide any drawback since both scripts could also be called directly one after the other with:
```sh
node appng.js && node massPayment.js or ./start_collector && node massPayment.js
```
However, it is strongly recommended to check the payments before the actual payments are done.
So you could as a best practise put the collector and checkPaymentFile in crontab and mail the output
for weekly scanning the results. And then plan the actual massPayment in crontab on the first of the month.
That way you have time to judge the payout amounts.


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
