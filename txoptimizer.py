#! /usr/bin/env python3

# NOTE
# This code is converted on website https://www.pythonconverter.com/ from 2.7 to 3
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
import urllib.request, urllib.parse, urllib.error
import time
import sys
import os
import bs4
import datetime
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
    urlget = urllib.request.urlopen(myurl)
    tokenjsondata = json.loads(urlget.read())
    return tokenjsondata

def currentdate():
    now = datetime.datetime.now()
    return now.strftime("%d-%m-%Y %H:%M:%S")


# Function to collects statistics of payment data
# params: @jsonarray : json data array
def paymentdatastats(jsonarray):
    
    recipientarray = [] #dictionary array
    assetarray = {}
    nopaywavesamount = 0
    nopaywavescount = 0
    nopaytokenamount = 0
    nopaytokencount = 0
    
    for item in jsonarray: #loop through the json data

        r = item['recipient']
        pay = "" #key which defines if recipient gets payed

        if 'pay' not in item: #key not found in json means old version of collector, set pay to yes
            item['pay'] = 'yes'
            pay = 'yes'
        else:
            pay = item['pay']

        if "assetId" not in item: #found waves

            if "Waves" not in assetarray: #add "Waves" to array
                assetarray['Waves'] = ""
                wavesamount = item['amount']
                wavescount = 1
                if (pay == 'no'):
                    nopaywavesamount = item['amount']
                    nopaywavescount = 1
            else: #Waves already in array
                wavesamount += item['amount']
                wavescount += 1
                if (pay == 'no'):
                    nopaywavesamount += item['amount']
                    nopaywavescount += 1
            
            assetarray['Waves'] = { 'count' : wavescount,
                                    'amount' : wavesamount,
                                    'name' : "",
                                    'decimals' : "",
                                    'nopaycount' : nopaywavescount,
                                    'nopayamount' : nopaywavesamount }

        else: #found asset (token)
            token = item['assetId']
            if token not in assetarray: # Add 'token' to array
                assetarray[token] = ""
                tokenamount = item['amount']
                tokencount = 1
                if (pay == 'no'):
                    nopaytokenamount = item['amount']
                    nopaytokencount = 1
            else: #token already in array
                tokenamount += item['amount']
                tokencount += 1
                if (pay == 'no'):
                    nopaytokenamount += item['amount']
                    nopaytokencount += 1

            assetarray[token] = { 'count' : tokencount,
                                  'amount' : tokenamount,
                                  'name' : "",
                                  'decimals' : 0,
                                  'nopaycount' : nopaytokencount, 
                                  'nopayamount' : nopaytokenamount }
        
        if r not in recipientarray: #add one unique recipient address
            recipientarray.append(r)

    printout =  "\n - total records             : " + str(len(jsonarray)) +\
                "\n - recipient addressses      : " + str(len(recipientarray)) +\
                "\n - assets found              : " + str(len(assetarray))
    
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
        nopayamount = assetarray[asset]['nopayamount'] / (math.pow(10,decimals))
        nopaycount = assetarray[asset]['nopaycount']
        assetcount = assetarray[asset]['count']
        payamount = (assetarray[asset]['amount'] - assetarray[asset]['nopayamount']) / (math.pow(10,decimals))
        paycount = assetcount - nopaycount

        printout += "\n   - asset " + str(cnt) + "                 : " + assetname +\
                    "\n     assetId                 : " + assetid +\
                    "\n     total amount / count    : " + str(amount) + " / " + str(assetcount) +\
                    "\n     'NO PAY' amount / count : " + str(nopayamount) + " / " + str(nopaycount) +\
                    "\n     '   PAY' amount / count : " + str(payamount) + " / " + str(paycount)

    recipientdict = {} #This dictionary will get all data relevant to create HTML file
    #pprint.pprint (newjoblist)
    
    for item in newjoblist: #cycle through all new payment data and add relevants to recipientdict
        #pprint.pprint (item)
        recipient = str(item['recipient'])
        amount = int(item['amount'])
        getpaid = item['pay']
        
        if recipient not in recipientdict: recipientdict[str(recipient)] = {} #add address to array
        
        if "assetId" not in item: #found Waves
            name = "Waves"
            decimals = int(assetarray[name]["decimals"])
            decamount = amount / math.pow(10,decimals)
            recipientdict[recipient][name] = { 'amount' : decamount,
                                               'pay' : getpaid }
        else: #found token
            assetid = str(item["assetId"])
            name = str(assetarray[assetid]["name"])
            decimals = int(assetarray[assetid]["decimals"])
            decamount = amount / math.pow(10,decimals)
            recipientdict[recipient][name] = { 'amount' : decamount,
                                               'pay' : getpaid }

    return printout,assetarray,recipientdict #can be referenced by var[0],[1],[2]

#Function to create html data
#Then use this data to write the new file
def preparehtml():
 
    lastjobid = payqueuelist[-1]
    forgedblockstext = "Total blocks forged:"
    startblocktext = "Payment startblock:"
    stopblocktext = "Payment stopblock:"
    distributiontext = "Distribution:"
    blocks = 0 #counter for forged blocks
    nopayaddresscount = 0 #counter for addresses not to get paid
    distpercentarray = {}
    reversedistpercentarray = {} #used to count if all the jobs have same distribution %
    distributepercentage = 'unknown' #If distribution tag not found in logfile, I must use unknown value to deselect

    for job in datafilelist: #cycle through array with all filenames
        logfile = payoutfileprefix + job + payfile_exts[2] #select only .log file
        logdata = open(logfile,'r') #read file
        distpercentarray[job] = distributepercentage

        for line in logdata: #This loop is to get the startblock of first job, stopblock of last job and #blocks forged
            if distributiontext in line:
                distribution = int(line[len(distributiontext):(len(line)-2)]) #Read percentage number from line 
                distpercentarray[job] = distribution
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

    for key, value in distpercentarray.items(): #create reverse array to check if all fee distribution share is same for all jobs
        reversedistpercentarray.setdefault(value, set()).add(key)
    
    #if all distribution percentages and value is not unknown, then set % value
    if (len(reversedistpercentarray) == 1 and list(reversedistpercentarray.keys())[0] != distributepercentage):
        distributepercentage = list(reversedistpercentarray.keys())[0]
 
    leasers = str(len(newjobstats[2]))
    date = (datetime.datetime.now()).strftime("%d-%m-%Y")

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
            "  <h3>Fees between blocks " + str(startblock) + " - " + str(stopblock) + ", Payout #" + str(firstjobid)
   
    if (distributepercentage != 'unknown'): html += ", ( " + str(distributepercentage) + "% )"
    
    html += "</h3>" +\
            "  <h4>(LPOS address: " + str(nodewallet) + ")</h4>" +\
            "  <h5>[ " + str(date) + " ]</h5>" +\
            "  <h5>Dear leasers, here's the periodic report of the fee distribution earned by wavesnode 'Plukkieforger'. Greetings!</h5> " +\
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
    
    if int(blocks) == 0:
        totaltokens = 0
        totalnopayoutwaves = 0
    else:
        totaltokens = len(newjobstats[1])-1 #how many different tokens in total 
        totalnopayoutwaves = newjobstats[1]['Waves']['nopayamount'] / math.pow(10,newjobstats[1]['Waves']['decimals'])

    for recipientstats in newjobstats[2]: #find for every address the waves and token amount, add to html
                                          #newjobstats[2] = recipientdict returned by 
                                          #                 def paymentdatastats(jsonarray)

        address = str(recipientstats) #leaser address
        wavesamount = float(newjobstats[2][address]['Waves']['amount']) #wavesamount for this recipient
        wavespaid = newjobstats[2][address]['Waves']['pay'] #pay yes/no?
        tokens = len(newjobstats[2][address])-1 #tokens found for this recipient

        html += "<tr><td>" + address + "</td><td>" + str(wavesamount) + "</td><td>"

        if tokens != 0: #there are other tokens than waves for this recipient

            for tokens in newjobstats[2][address]: #find all tokens for this recipient
                assetname = str(tokens) #find all tokennames for an address
                if assetname is not "Waves":
                    tokenamount = newjobstats[2][address][assetname]['amount']
                    html += str(tokenamount) + "</td><td>"
        else: #no other tokens, only waves for this recipient
            for x in range(0,totaltokens): #repeat for the total tokens
                html +=  "0" + "</td><td>"

        if (wavespaid == 'no'):
            nopayaddresscount += 1
            html += "* NO PAYOUT *" + "</td><td>"

        html += "\r\n"

    if int(blocks) == 0: #no blocks forged

        html += "<tr><td><b>Total amount</b></td><td><b>0</b></td>" + "\r\n"
        html += "<tr><td><b>No Payout amount</b></td><td><b>0</b></td>" + "\r\n"
    
    else:

        for x in range(0,2): #loop to write line for total fees and total no payout fees

            if x == 0: #write line for total amounts
            
                if int(blocks) != 0:
                    totalwaves = newjobstats[1]['Waves']['amount']
                    decimals = newjobstats[1]['Waves']['decimals']
                    decimalwaves = totalwaves / math.pow(10, decimals)

                html += "<tr><td><b>Total amount</b></td><td><b>" + str(decimalwaves)

                for token in newjobstats[1]: #for every token in assetarray
                    if str(token) is not "Waves":
                        totamount = newjobstats[1][token]['amount'] #this is the total amount of this token
                        decimals = newjobstats[1][token]['decimals']
                        decamount = totamount / math.pow(10, decimals)
            
                        html += "</b></td><td><b>" + str(decamount) + "</b></td><td><b>"
    
                html += "\r\n"
        
            if x == 1: #write line for no payout amounts
            
                totalwaves = newjobstats[1]['Waves']['nopayamount']
                decimals = newjobstats[1]['Waves']['decimals']
                decimalwaves = totalwaves / math.pow(10, decimals)

                html += "<tr><td><b>No Payout amount (" + str(nopayaddresscount) + " recipients)</b></td><td><b>" + str(decimalwaves)

                for token in newjobstats[1]: #for every token in assetarray
                    if str(token) is not "Waves":
                        totamount = newjobstats[1][token]['nopayamount'] #this is the total amount of this token
                        decimals = newjobstats[1][token]['decimals']
                        decamount = totamount / math.pow(10, decimals)
            
                        html += "</b></td><td><b>" + str(decamount) + "</b></td><td><b>"
    
                html += "\r\n"
            # END FOR LOOP

    html += "</tbody>" +\
            "  </table>" +\
            "</div>" +\
            "</body>" +\
            "</html>"

    filename = payoutfileprefix + str(firstjobid) + payfile_exts[1]
    htmlfile = open(filename, 'w') #write html to file
    htmlfile.write(html)
    htmlfile.close()
    return blocks,startblock,stopblock,leasers,distributepercentage,distributiontext,forgedblockstext,startblocktext,stopblocktext

#Function to do some filechecking and preproc before we can start
def prechecks():
    if os.path.isfile(configfile) != True:
        print("\n Oh no, missing config file '" + configfile + "'. What went wrong? Get it from github repo...\n")
        exit()
    with open(configfile, "r") as json_file:     # read and set variables from config file
        jsonconfigdata = json.load(json_file)
    
    if "optimizerdir" not in jsonconfigdata['toolbaseconfig']: #optimzerkey missing, let's add
        jsonconfigdata['toolbaseconfig']['optimizerdir'] = "txoptimizer"
        
        print("\n Missing JSON key 'txoptimizer' in config, adding to '" + configfile + "'")
        print(" This was a one time action :-)\n")
        
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
    print("[ OK ]")
    time.sleep(endsleep)

#Function to write json to file
#params: @targetfile: file to write
#        @jsondata: json object
def writejsonfile(targetfile, jsondata):
    with open(targetfile, 'w') as outputfile:
        json.dump(jsondata, outputfile)

def errorchecks():
    if os.path.isfile(payqueuefile) != True:
        print("\n No payqueue file found. Is this your first run maybe?")
        print(" Start a collector session with node appng.js first.\n")
        exit()
    if os.path.isfile(nextbatchfile) != True:
        print("\n No batchinfo file found. Is this your first run maybe?")
        print(" Start a collector session with node appng.js first.\n")
        exit()
    if os.path.isdir(optimizer) != True:
        print("Optimizer folder not found, create './" + optimizer + "'", end=' ')
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
            nopayamount = newjobstats[1][str(asset)]['nopayamount'] / math.pow(10,decimals)

            textblock += "total Waves fees: " + str(decamount) + "\n"
            if (nopayamount != 0): textblock += "NO PAYOUT Waves: " + str(nopayamount) + "\n" 

        else: #token
            totamount = newjobstats[1][str(asset)]['amount'] #this is the total amount of this token
            decimals = newjobstats[1][str(asset)]['decimals']
            decamount = totamount / math.pow(10, decimals)
            assetname = newjobstats[1][str(asset)]['name']
            nopayamount = newjobstats[1][str(asset)]['nopayamount'] / math.pow(10,decimals)

            textblock += "total '" + str(assetname) + "': " + str(decamount) + "\n"
            if (nopayamount != 0): textblock += "NO PAYOUT " + str(assetname) + ": " + str(nopayamount) + "\n"
    
    textblock += forgedblockstext + " " + str(blocks)
    textblock += "\nLeasers : " + str(leasers)
    textblock += "\nPayment ID of batch session: " + str(int(firstjobid))
    textblock += "\n" + startblocktext + " " + str(int(startblock))
    textblock += "\n" + stopblocktext + " " + str(int(stopblock))
    
    if (distributepercentage != 'unknown'): textblock += "\n" + distributiontext + " " + str(distributepercentage) + "%"

    textblock += "\nFollowing addresses are skipped for payment;"

    for nopayaddress in nopayoutaddresses:
        textblock += "\n[ " + str(nopayaddress) + " ]"

    textblock += "\n\nBatch [" + str(firstjobid) + "] was optimized with 'txoptimizer.py'"
    textblock += "\nMerged jobs " + str(payqueuelist) + " into new job [" + str(firstjobid) + "].\n"
   
    textblock += "\n*** " +  currentdate() + " ***\n"

    filename = payoutfileprefix + str(firstjobid) + payfile_exts[2]
    logfile = open(filename, 'w') #write logdata to file
    logfile.write(textblock)
    logfile.close()

print()
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
    nodewallet = jsonconfigdata["paymentconfig"]["leasewallet"]


errorchecks()

with open(payqueuefile, "r") as json_file:   # read the queue file with pending payment jobs
    payqueuelist = json.load(json_file)
    payjobs = len(payqueuelist)
    if payjobs <= 1:
        print("Checked payment queue...found",payjobs, "pending jobs. Txoptimizer needs => 2 payjobs ;-)")
        print("No action taken, exit.\n")
        exit()
    else:
        firstjobid = payqueuelist[0] #set jobnr of first payid for reference
        mergedjobs = str(payqueuelist)
        secondaryjobs = payqueuelist[1:]

with open(nextbatchfile, "r") as json_file:  # read next batch data for collector
    jsonnextbatchdata = json.load(json_file)
    nextcollectorjob = jsonnextbatchdata["batchdata"]["paymentid"]


print("Found",payjobs,"jobs in the queue. Optimizing data", end=' ')
countdown("nodef", 20)
print()

for x in payqueuelist:  # cycle through paymentqueue and collect json files in 2 lists with json objects
    feedatafile = payoutfileprefix + str(x) + payfile_exts[0]
    with open(feedatafile, "r") as json_file:
        jsonpaymentdict = json.load(json_file)
    if x == firstjobid:
        newjoblist = jsonpaymentdict #primary job array which gets all others merged. It's a (list) with 'objects'
        oldjobstats = paymentdatastats(newjoblist) #run function to collect stats and bind to var oldjobstats
    else: #finds the secundary json arrays
        secjoblist = jsonpaymentdict #secundary job array
        assetnamearray = {} #array to collect token names
        primaryarraylength = len(newjoblist)
        
        for obj2 in secjoblist: #cycle through all objects in secundary list
            #pprint.pprint (secjoblist) #TEST
            #print assetarray #TEST
            
            obj2index = secjoblist.index(obj2) #index starts at 0
            recipient2 = obj2['recipient']
            amount2 = int(obj2['amount'])
            
            if "assetId" in obj2: #found a token (it's NOT Waves)
                assetId2 = obj2['assetId']
                if assetId2 not in assetnamearray: #add token with name if not in array
                    tokendata = gettokendetails(assetId2) #collect token name
                    #pprint.pprint (tokendata)
                    tokenname = tokendata['name']
                    assetnamearray[assetId2] = tokenname #put tokenname in array
                else:
                    tokenname = assetnamearray[assetId2] #get tokenname from array
            else: #found waves
                assetId2 = 'Waves'
                tokenname = 'Waves'
           
            if primaryarraylength == 0: #primary job is empty, push secondary complete into primary
                
                print("'No match! Add job " + str(x) + ",index [" + str(obj2index) +\
                      "], asset '" + str(tokenname) + "', recipient '" + recipient2 + "' to job " +\
                      str(firstjobid) + ",index [" + str(obj2index) + "], amount [ " +\
                      str(amount2) + " ]", end=' ')
                
                countdown("nodef", 5, 0.005, 0.01)
                newjoblist.append(obj2) #Add object from secundary array to primary array

            else: #primary job not empty
                
                for obj1 in newjoblist: #cycle through complete primary list and compare with sec list item
                    obj1index = newjoblist.index(obj1)
                    recipient1 = obj1['recipient']
                    amount1 = int(obj1['amount'])
                    if "assetId" in obj1: #found a token (it's NOT Waves)
                        assetId1 = obj1['assetId']
                    else: #found waves
                        assetId1 = 'Waves'

                    if ( recipient2 == recipient1 ) and ( assetId2 == assetId1 ): #match on address and asset
                        print("'Match! Merge job " + str(x) + ",index [" + str(obj2index) +\
                                "], asset '" + str(tokenname) + "', recipient '" + recipient2 + "' in job " +\
                                str(firstjobid) + ",index [" + str(obj1index) + "], amount [ " +\
                                str(amount2) + " + " + str(amount1) + " ]", end=' ')
                        countdown("nodef", 5, 0.005, 0.01)
                        newamount = amount1 + amount2
                        newjoblist[obj1index]['amount'] = newamount #updated amount in primary array
                        break #stop scanning remainder of the loop
                    if obj1index == len(newjoblist) - 1: #Reached end of primary array
                        print("'No match! Add job " + str(x) + ",index [" + str(obj2index) +\
                                "], asset '" + str(tokenname) + "', recipient '" + recipient2 + "' to job " +\
                                str(firstjobid) + ",index [" + str(obj1index+1) + "], amount [ " +\
                                str(amount2) + " ]", end=' ')
                        countdown("nodef", 5, 0.005, 0.01)
                        newjoblist.append(obj2) #Add object from secundary array to primary array
                        break #stop scanning reamainder of the loop


newjobstats = paymentdatastats(newjoblist) #execute function on new primary array
for i in range(70):
    sys.stdout.write("=")
    sys.stdout.flush()
    time.sleep(0.008)
print()



print("Done scanning all payment records", end=' ')
countdown("nodef", 31)

print("Merged " + str(payjobs) + " jobs " + mergedjobs + " into new job [" + str(firstjobid) + "]", end=' ')
countdown("nodef", 22)

print("\nOld data for job [" + str(firstjobid) + "]", end=' ')
countdown("nodef", 43)
print((oldjobstats[0]) + "\n")
time.sleep(2)

print("New data for job [" + str(firstjobid) + "]", end=' ')
countdown("nodef", 43)
print((newjobstats[0]) + "\n")
time.sleep(2)


print("Backing up file '" + payqueuefile + "' -> '" + payqueuefile + ".bak'", end=' ')
countdown(writejsonfile(payqueuefile + ".bak", payqueuelist), 12)

print("Backing up file '" + nextbatchfile + "' -> '" + nextbatchfile + ".bak'", end=' ')
countdown(writejsonfile(nextbatchfile + ".bak", jsonnextbatchdata), 8)

print("Backup datafiles of all payjobs in './" + optimizer + "/'", end=' ')
print("\n")
time.sleep(1)

for i in range(0,payjobs): #copy all datafiles to optimizer folder for archival
    datafilelist[str(payqueuelist[i])] = {}
    filenr = 0
    for ext in payfile_exts:
        filenr += 1
        srcfile = payoutfileprefix + str(payqueuelist[i]) + ext
        datafilelist[str(payqueuelist[i])][str(filenr)] = str(srcfile)
        dstfile = "./" + optimizer + "/" + payoutfileprefix + str(payqueuelist[i]) + "_to_" + str(firstjobid) + ext
        print(" '" + srcfile + " -> '" + dstfile + "'", end=' ')
        if len(ext) is 4: print(" ", end=' ')
        countdown(copyfile(srcfile, dstfile), 8, 0.0025, 0.025)

print("\nWriting new data for payjob [" + str(firstjobid) + "]", end=' ')
countdown( (writejsonfile((payoutfileprefix + str(firstjobid) + payfile_exts[0]), newjoblist)), 27, 0.001, 0.1)
blocks,startblock,stopblock,leasers,distributepercentage,distributiontext,forgedblockstext,startblocktext,stopblocktext = preparehtml()

print("\nUpdate logfile for job [" + str(firstjobid) + "]", end=' ')
countdown(writelogfile(), 32)

print("Update '" + payqueuefile + "'", end=' ')
for i in range(1, len(payqueuelist)): del payqueuelist[-1]
countdown( writejsonfile(payqueuefile,payqueuelist),38)

print("Update '" + nextbatchfile + "'", end=' ') #change next payment id in batchinfo file
jsonnextbatchdata["batchdata"]["paymentid"] = str(firstjobid+1)
countdown(writejsonfile(nextbatchfile,jsonnextbatchdata), 36)
print()

print("Delete all datafiles of merged payjobs " + str(secondaryjobs) + "\n")
for i in datafilelist:
    if str(i) != str(firstjobid): #only delete merged job files, not first job yet
        for filekey in datafilelist[i]:
            filename = datafilelist[i][str(filekey)]
            fileextension = os.path.splitext(filename)[1]
            print(" Delete '" + filename + "'", end=' ')
            if len(fileextension) == 4: print("", end=' ')
            countdown(os.remove(filename), 29, 0.0025, 0.025) #delete all files
            #countdown("nodef", 24, 0.0025, 0.025) #activate for testing (it does not delete the file)
print()
print("Finished optimizing. Check revised pending payment job with './start_checker.sh'\n")
print("          ***   scripting for a community project is thankfull!   ***")
print("          ***      but it consumes private time and efforts       ***")
print("          ***                                                     ***")
print("          ***  gifts are welcome at alias 'donatewaves@plukkie'   ***")
print("\n")

