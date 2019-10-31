#! /usr/bin/env python

# This script optimizes the pending payment transactions
# The WavesLPOSdistributer script works as follows;
# When the appng.js script finishes, the payjob id is added to the payqueue.dat 
# If another collector session is started, the next payjob id is added.
# The payqueue consists then of multiple mass payment jobs with lots of the same
# leasing addresses.
# If this optimizer is started after collections, then the transaction data is merged
# and the number is transactions and fees is reduced.
# Leasers will also see accumulated payment in their wallets instead
# of multiple smaller payments.

# Let's import the required modules
import json
import pprint
import math
import urllib
import time
import sys
import os
import bs4
from shutil import copyfile

configfile = "config.json"
payfile_exts = [ ".json", ".html", ".log" ]
datafilelist = {}
payjobs = 0 #the number of pending payjobs in the queue
firstjobid = 0 #first job id from queue (set later stage)

# Function to collect details of tokens (not Waves)
# params: @assetid : assetId of token to query
def gettokendetails(assetid):
    myurl = querynode + '/transactions/info/' + assetid
    urlget = urllib.urlopen(myurl)
    tokenjsondata = json.loads(urlget.read())
    return tokenjsondata

# Function to collects statistics of payment data
# params: @jsonarray : json data array
def paymentdatastats(jsonarray):
    recipientarray = [] #dictionary array
    assetarray = {}
    for item in jsonarray: #loop through the json data
        r = item['recipient']
        if "assetId" not in item: #found waves
            if "Waves" not in assetarray: #add "Waves" to array
                assetarray['Waves'] = ""
                wavesamount = item['amount']
                wavescount = 1
            else:
                wavesamount += item['amount']
                wavescount += 1
            
            assetarray['Waves'] = { 'count' : wavescount,
                                    'amount' : wavesamount,
                                    'name' : "",
                                    'decimals' : "" }
        else: #found asset (token)
            token = item['assetId']
            if token not in assetarray: # Add 'token' to array
                assetarray[token] = ""
                tokenamount = item['amount']
                tokencount = 1
            else:
                tokenamount += item['amount']
                tokencount += 1

            assetarray[token] = { 'count' : tokencount,
                                  'amount' : tokenamount,
                                  'name' : "",
                                  'decimals' : 0 }
        
        if r not in recipientarray: #add one unique recipient address
            recipientarray.append(r)

    printout =  "\n - total records          : " + str(len(jsonarray)) +\
                "\n - recipient addressses   : " + str(len(recipientarray)) +\
                "\n - assets found           : " + str(len(assetarray))
    
    for asset in assetarray:
        if asset == 'Waves':
            assetname = 'Waves'
            assetarray[asset]['name'] = assetname
            assetid = 'WAVES'
            decimals = 8
            assetarray[asset]['decimals'] = decimals
        else:
            tokendetails = gettokendetails(asset) #execute function to collect some token details
            assetname = tokendetails['name']
            assetarray[asset]['name'] = assetname
            assetid = asset
            decimals = tokendetails['decimals']
            assetarray[asset]['decimals'] = decimals
        try:
            cnt
        except:
            cnt = 0
        cnt += 1
        amount = assetarray[asset]['amount'] / (math.pow(10,decimals))
        printout += "\n   - asset " + str(cnt) + "              : " + assetname +\
                    "\n     assetId              : " + assetid +\
                    "\n     amount to distribute : " + str(amount)

    recipientdict = {} #This dictionary gets all data relevant to create HTML file
    #pprint.pprint (newjoblist)
    
    for item in newjoblist: #cycle through all new payment data and add relevants to recipientdict
        #pprint.pprint (item)
        recipient = str(item['recipient'])
        amount = int(item['amount'])
        if recipient not in recipientdict: recipientdict[str(recipient)] = {} #add address to array
        
        if "assetId" not in item: #found Waves
            name = "Waves"
            decimals = int(assetarray[name]["decimals"])
            decamount = amount / math.pow(10,decimals)
            recipientdict[recipient][name] = str(decamount)
        else: #found token
            assetid = str(item["assetId"])
            name = str(assetarray[assetid]["name"])
            decimals = int(assetarray[assetid]["decimals"])
            decamount = amount / math.pow(10,decimals)
            recipientdict[recipient][name] = str(decamount)

    return printout,assetarray,recipientdict

#Function to create html data
#Then use this data to write the new file
def preparehtml():
    nodewallet = jsonpaymentdict[0]['sender']
    lastjobid = payqueuelist[-1]
    forgedblockstext = "Total blocks forged:"
    startblocktext = "Payment startblock:"
    stopblocktext = "Payment stopblock:"
    blocks = 0 #counter for forged blocks
    for job in datafilelist: #cycle through array with all filenames
        logfile = payoutfileprefix + job + payfile_exts[2] #select only .log file
        logdata = file(logfile) #read file
        for line in logdata:
            if forgedblockstext in line: #find number of forged blocks
                startindex = line.index(forgedblockstext) + len(forgedblockstext)
                blocks += int(line[startindex:])
            elif (startblocktext in line) and (str(job) == str(firstjobid)):
                startindex = line.index(startblocktext) + len(startblocktext)
                startblock = line[startindex:] #startblock of primary job
            elif (stopblocktext in line) and (str(job) == str(lastjobid)):
                startindex = line.index(stopblocktext) + len(stopblocktext)
                stopblock = line[startindex:] #stopblock of last secundary job
    logdata.close()

    leasers = str(len(newjobstats[2]))

    html =  "<!DOCTYPE html>" +\
            "<html lang=\"en\">" +\
            "<head>" +\
            "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +\
            "  <link rel=\"stylesheet\" href=\"https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css\">" +\
            "  <script src=\"https://ajax.googleapis.com/ajax/libs/jquery/3.2.1/jquery.min.js\"></script>" +\
            "  <script src=\"https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js\"></script>" +\
            "</head>" +\
            "<body>" +\
            "<div class=\"container\">" +\
            "  <h3>Fee's between blocks " + str(startblock) + " - " + str(stopblock) + ", Payout #" + str(firstjobid) + "</h3>" +\
            "  <h4>(LPOS address: " + str(nodewallet) + ")</h4>" +\
            "  <h5>01-06-2019: Hi all, again a short update of the fee's earned by the wavesnode 'Plukkieforger'. Greetings!</h5> " +\
            "  <h5>You can always contact me by <a href=\"mailto:" + str(mail) + "\">E-mail</a></h5>" +\
            "  <h5>Blocks forged: " + str(blocks) + " Leasers: " + leasers + "</h5>" +\
            "  <table class=\"table table-striped table-hover\">" +\
            "    <thead> " +\
            "      <tr>" +\
            "        <th>Recipient Address</th>" +\
            "        <th>Waves</th>"

    for asset in newjobstats[1]: #cycle to assetarray
        assetname = str(newjobstats[1][asset]['name'])
        if assetname is not "Waves": #found token
            tokenheader = "        <th>" + assetname + "</th>"
            html += tokenheader

    html += "      </tr>" +\
            "    </thead>" +\
            "    <tbody>"
    
    totalwaves = 0
    for recipientstats in newjobstats[2]: #find for every address the waves and token amount, add to html
        address = str(recipientstats) #leaser address
        wavesamount = float(newjobstats[2][address]['Waves'])
        totalwaves += wavesamount
        html += "<tr><td>" + address + "</td><td>" + str(wavesamount) + "</td><td>"
        
        for tokens in newjobstats[2][address]:
            assetname = str(tokens) #find all assetnames for an address
            if assetname is not "Waves":
                tokenamount = newjobstats[2][address][assetname]
                html += tokenamount + "</td><td>" + "\r\n"

    
    html += "<tr><td><b>Total</b></td><td><b>" + str(totalwaves)

    for token in newjobstats[1]: #for every token in assetarray
        if str(token) is not "Waves":
            totamount = newjobstats[1][token]['amount'] #this is the total amount of this token
            decimals = newjobstats[1][token]['decimals']
            decamount = totamount / math.pow(10, decimals)
            
            html += "</b></td><td><b>" + str(decamount) + "</b></td><td><b>"
    
    html += "\r\n"

    html += "</tbody>" +\
            "  </table>" +\
            "</div>" +\
            "</body>" +\
            "</html>"

    filename = payoutfileprefix + str(firstjobid) + payfile_exts[1]
    htmlfile = open(filename, 'w') #write html to file
    htmlfile.write(html)
    htmlfile.close()
    return blocks,startblock,stopblock,leasers

#Function to do some filechecking and preproc before we can start
def prechecks():
    if os.path.isfile(configfile) <> True:
        print "\n Oh no, missing config file '" + configfile + "'. What went wrong? Get it from github repo...\n"
        exit()
    with open(configfile, "r") as json_file:     # read and set variables from config file
        jsonconfigdata = json.load(json_file)
    
    if "optimizerdir" not in jsonconfigdata['toolbaseconfig']: #optimzerkey missing, let's add
        jsonconfigdata['toolbaseconfig']['optimizerdir'] = "txoptimizer"
        
        print "\n Missing JSON key 'txoptimizer' in config, adding to '" + configfile + "'"
        print " This was a one time action :-)\n"
        
        with open(configfile, "w") as json_file:     # write to config file
            json.dump(jsonconfigdata, json_file)
        time.sleep(1)


#Function which presents a waitingtimer while executing another function
#params: @execdef: function to start during the timer, use "nodef"
#                  if you don't want a function, but only timer.
#        @dots: how many dots to print
#        @interval: how long between the dots (secs)
#        @endsleep: how long to wait after counter finished (secs)
def countdown(execdef, dots=10, interval=0.005, endsleep=0.3):
    for i in range(dots):
        if i == 0 and execdef is not "nodev":
                execdef
        sys.stdout.write(".")
        sys.stdout.flush()
        time.sleep(interval)
    print"[ OK ]"
    time.sleep(endsleep)

#Function to write json to file
#params: @targetfile: file to write
#        @jsondata: json object
def writejsonfile(targetfile, jsondata):
    with open(targetfile, 'w') as outputfile:
        json.dump(jsondata, outputfile)

def errorchecks():
    if os.path.isfile(payqueuefile) <> True:
        print "\n No payqueue file found. Is this your first run maybe?"
        print " Start a collector session with node appng.js first.\n"
        exit()
    if os.path.isfile(nextbatchfile) <> True:
        print "\n No batchinfo file found. Is this your first run maybe?"
        print " Start a collector session with node appng.js first.\n"
        exit()
    if os.path.isdir(optimizer) <> True:
        print "Optimizer folder not found, create './" + optimizer + "'",
        def createdir(folder):
            os.mkdir(folder)
        countdown(createdir(optimizer), 12)

def writelogfile(): #function that writes new logfile for first job
    
    textblock = ""

    for asset in newjobstats[1]: #for every asset in assetarray
        if str(asset) is "Waves":
            totamount = newjobstats[1][str(asset)]['amount']
            decimals = newjobstats[1][str(asset)]['decimals']
            decamount = totamount / math.pow(10, decimals)
            textblock += "total Waves fees: " + str(decamount) + "\n"
        else: #token
            totamount = newjobstats[1][str(asset)]['amount'] #this is the total amount of this token
            decimals = newjobstats[1][str(asset)]['decimals']
            decamount = totamount / math.pow(10, decimals)
            assetname = newjobstats[1][str(asset)]['name']
            textblock += "total '" + str(assetname) + "': " + str(decamount) + "\n"
    
    textblock += "Total blocks forged: " + str(blocks)
    textblock += "\nLeasers : " + str(leasers)
    textblock += "\nPayment ID of batch session: " + str(int(firstjobid))
    textblock += "\nPayment startblock: " + str(int(startblock))
    textblock += "\nPayment stopblock: " + str(int(stopblock))
    textblock += "\nFollowing addresses are skipped for payment;"
    textblock += "\n" + str(nopayoutaddresses)
    textblock += "\n\nThis batch was optimized with 'txoptimizer.py'"
    textblock += "\nMerged jobs " + mergedjobs + " into this job.\n"
    
    filename = payoutfileprefix + str(firstjobid) + payfile_exts[2]
    logfile = open(filename, 'w') #write logdata to file
    logfile.write(textblock)
    logfile.close()

print
prechecks()

with open(configfile, "r") as json_file:     # read and set variables from config file
    jsonconfigdata = json.load(json_file)
    payoutfileprefix = jsonconfigdata["toolbaseconfig"]["payoutfilesprefix"]
    nextbatchfile = jsonconfigdata["toolbaseconfig"]["batchinfofile"]
    payqueuefile = jsonconfigdata["toolbaseconfig"]["payqueuefile"]
    querynode = jsonconfigdata["paymentconfig"]["querynode_api"]
    optimizer = jsonconfigdata["toolbaseconfig"]["optimizerdir"]
    mail = jsonconfigdata["paymentconfig"]["mail"]
    nopayoutaddresses = jsonconfigdata["paymentconfig"]["nopayoutaddresses"]

errorchecks()

with open(payqueuefile, "r") as json_file:   # read the queue file with pending payment jobs
    payqueuelist = json.load(json_file)
    payjobs = len(payqueuelist)
    if payjobs <= 1:
        print "Checked payment queue...found",payjobs, "pending jobs. Txoptimizer needs => 2 payjobs ;-)"
        print "No action taken, exit.\n"
        exit()
    else:
        firstjobid = payqueuelist[0] #set jobnr of first payid for reference
        mergedjobs = str(payqueuelist[1:len(payqueuelist)])

with open(nextbatchfile, "r") as json_file:  # read next batch data for collector
    jsonnextbatchdata = json.load(json_file)
    nextcollectorjob = jsonnextbatchdata["batchdata"]["paymentid"]


print "Found",payjobs,"jobs in the queue. Optimizing data",
countdown("nodef", 20)
print

for x in payqueuelist:  # cycle through paymentqueue and collect json files in 2 lists with json objects
    feedatafile = payoutfileprefix + str(x) + payfile_exts[0]
    with open(feedatafile, "r") as json_file:
        jsonpaymentdict = json.load(json_file)
    if x == firstjobid:
        newjoblist = jsonpaymentdict #primary job array which gets all others merged. It's a (list) with 'objects'
        oldjobstats = paymentdatastats(newjoblist) #run function to collect stats and bind to var oldjobstats
    else: #finds the secundary json arrays
        secjoblist = jsonpaymentdict #secundary job array
        
        for obj2 in secjoblist: #cycle through all objects in secundary list
            obj2index = secjoblist.index(obj2) #index starts at 0
            recipient2 = obj2['recipient']
            amount2 = int(obj2['amount'])
            if "assetId" in obj2: #found a token (it's NOT Waves)
                assetId2 = obj2['assetId']
            else: #found waves
                assetId2 = 'Waves'
            
            for obj1 in newjoblist: #cycle through complete primary list and compare with sec list item
                obj1index = newjoblist.index(obj1)
                recipient1 = obj1['recipient']
                amount1 = int(obj1['amount'])
                if "assetId" in obj1: #found a token (it's NOT Waves)
                    assetId1 = obj1['assetId']
                else: #found waves
                    assetId1 = 'Waves'

                if ( recipient2 == recipient1 ) and ( assetId2 == assetId1 ): #match on address and asset
                    print "'Found match. Merge job " + str(x) + ",index [" + str(obj2index) +\
                            "], asset '" + assetId2 + "', recipient '" + recipient2 + "' in job " +\
                            str(firstjobid) + ",index [" + str(obj1index) + "], amount [ " +\
                            str(amount2) + " + " + str(amount1) + " ]",
                    countdown("nodef", 10, 0.005, 0.01)
                    newamount = amount1 + amount2
                    newjoblist[obj1index]['amount'] = newamount #updated amount in primary array
                    break #stop scanning remainder of the loop
                if obj1index == len(newjoblist) - 1: #Reached end of primary array
                    print "'No match found. Add job " + str(x) + ",index [" + str(obj2index) +\
                            "], asset '" + assetId2 + "', recipient '" + recipient2 + "' to job " +\
                            str(firstjobid) + ",index [" + str(obj1index+1) + "], amount [ " +\
                            str(amount2) + " ]",
                    countdown("nodef", 10, 0.005, 0.01)
                    newjoblist.append(obj2) #Add object from secundary array to primary array
                    break #stop scanning reamainder of the loop


newjobstats = paymentdatastats(newjoblist) #execute function on new primary array
for i in range(70):
    sys.stdout.write("=")
    sys.stdout.flush()
    time.sleep(0.008)
print



print "Done scanning all payment records",
countdown("nodef", 31)

print "Merged " + str(payjobs-1) + " jobs " + mergedjobs + " into jobid [" + str(firstjobid) + "]",
countdown("nodef", 22)

print "\nOld data for job [" + str(firstjobid) + "]",
countdown("nodef", 43)
print (oldjobstats[0]) + "\n"
time.sleep(2)

print "New data for job [" + str(firstjobid) + "]",
countdown("nodef", 43)
print (newjobstats[0]) + "\n"
time.sleep(2)


print "Backing up file '" + payqueuefile + "' -> '" + payqueuefile + ".bak'",
countdown(writejsonfile(payqueuefile + ".bak", payqueuelist), 12)

print "Backing up file '" + nextbatchfile + "' -> '" + nextbatchfile + ".bak'",
countdown(writejsonfile(nextbatchfile + ".bak", jsonnextbatchdata), 8)

print "Backup jsonfiles of all payjobs in './" + optimizer + "/'",
print "\n"
time.sleep(1)

for i in range(0,payjobs): #copy all datafiles to optimizer folder for archival
    datafilelist[str(payqueuelist[i])] = {}
    filenr = 0
    for ext in payfile_exts:
        filenr += 1
        srcfile = payoutfileprefix + str(payqueuelist[i]) + ext
        datafilelist[str(payqueuelist[i])][str(filenr)] = str(srcfile)
        dstfile = "./" + optimizer + "/" + payoutfileprefix + str(payqueuelist[i]) + "_to_" + str(firstjobid) + ext
        print " '" + srcfile + " -> '" + dstfile + "'",
        if len(ext) is 4: print " ",
        countdown(copyfile(srcfile, dstfile), 8, 0.0025, 0.025)

print "\nWriting new data for payjob [" + str(firstjobid) + "]",
countdown( (writejsonfile((payoutfileprefix + str(firstjobid) + payfile_exts[0]), newjoblist)), 27, 0.001, 0.1)
blocks,startblock,stopblock,leasers = preparehtml()

print "\nUpdate logfile for job [" + str(firstjobid) + "]",
countdown(writelogfile(), 32)

print "Update '" + payqueuefile + "'",
for i in range(1, len(payqueuelist)): del payqueuelist[-1]
countdown( writejsonfile(payqueuefile,payqueuelist),38)

print "Update '" + nextbatchfile + "'", #change next payment id in batchinfo file
jsonnextbatchdata["batchdata"]["paymentid"] = str(firstjobid+1)
countdown(writejsonfile(nextbatchfile,jsonnextbatchdata), 36)
print

print "Delete all data files of merged payjobs " + mergedjobs + "\n"
for i in datafilelist:
    if str(i) != str(firstjobid): #only delete merged job files, not first job yet
        for filekey in datafilelist[i]:
            filename = datafilelist[i][str(filekey)]
            fileextension = os.path.splitext(filename)[1]
            print " Delete '" + filename + "'",
            if len(fileextension) == 4: print "",
            countdown(os.remove(filename), 29, 0.0025, 0.025) #delete all files
            #countdown("nodef", 24, 0.0025, 0.025) #activate for testing (it does not delete the file)
print
print "Finished optimizing. Check revised pending payment job with './start_chacker.sh'\n"
print "\n*** If you enjoy this script, gifts are welcome at alias 'donatewaves@plukkie' ***"
print "\n\n"



