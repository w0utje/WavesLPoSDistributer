#! /usr/bin/env python3

# This tool gives an overview of the node and its properties

import json
import urllib3
import pprint
import time
import datetime
import collections
import math
import os
import urllib.request as http
import urllib.error
import sys

configfile = "config.json"
https = urllib3.PoolManager()
pp = pprint.pprint


# Read configfile settings in JSON format
with open(configfile, "r") as json_file:

    jc = json.load(json_file)
    
    au = jc['api_uris'] # API uri's from configfile
    pc = jc['paymentconfig'] # base config from configfile
    cn = jc['forktoolsconfig']['controlnodes'] # Configered control nodes
    wa = pc['leasewallet'] # Node Wallet address
    qn = pc['querynode_api'] # Query node base uri (http(s)://host:port)


## Function that converts Unix epoctime to human readable format
## params:
## - unixstamp : unix epoch time in msecs
def get_time (unixtime):
    secs = int(unixtime)/1000 # unix epoch time in seconds
    mytime = time.strftime("%d-%m-%Y %H:%M:%S", time.gmtime(secs))
    
    return mytime


def check_start_mode(): # How is app started

    try:
        a0 = sys.argv[0]
        a1 = sys.argv[1].lower()

        if 'help' in a1:
            print('\n Show info about your Waves node and various wallet statistics.')
            print("\n usage: " + a0 + " <command options>")
            print("        Started without options, shows summary of node and wallet info.")
            print("\n command options:")
            print(" help    : Shows this help screen")
            print(" detail  : Shows extended info about node peers and leasers\n")

            a1 = 'help'

    except:
        a1 = "default"

    return a1

## Function to get_jsondata from a node
## return json.data
## params:
## - node : http(s)://node:port where api server can be reached
## - base_uri : /the/uri/to/query
def get_jsondata(node, base_uri):

    myurl = node + base_uri

    try:
        urlget = https.request('GET', myurl)
        jsondata = json.loads(urlget.data)

    except:
        jsondata = {}

    return jsondata


## Function that returns all requested blockchain data in JSON dictionary
def get_blockchaindata ():
    
    datadict = {}

    for key in au.keys():
        uri = au[key]
        s = au[key].find("{address}") # If {address} found, start index is returned, else -1
        if s != -1: # Address string found, need to replace with wallet address
            uri = au[key].replace('{address}',wa) # replace {address} with wallet address
        jd = get_jsondata ( qn, uri ) # API GET request
        datadict[key] = jd # Add JSON data to key in dictionary

    def order_dict (): # Function to organise some data
        
        datadict['leasers'] = {}
        activeleases = len(datadict['active_leases']) # total active leases for node
        firstleaserblock = 0 # This item used to show which is the block with the first leasers
        oldestlease = 0 # oldest lease time

        for lease in datadict['active_leases']: # loop through all active leases
             
            sender = lease['sender']
            amount = lease['amount']
            timestamp = lease['timestamp'] # Timestamp current lease (unix time)
            mytime = get_time(timestamp) # Timestamp in my custom readable format
            
            if oldestlease == 0:
                oldestlease = timestamp
                firstleaserblock = lease['height']

            if timestamp < oldestlease: # Current lease is older then previous
                oldestlease = timestamp
                firstleaserblock = lease['height']
                firstleaser = sender

            if sender not in datadict['leasers']: # Add sender, amount, txs
                datadict['leasers'][sender] = { 'amount' : amount, 'txs' : 1, 'timestamp' : timestamp , 'lease_start' : mytime }

            else: # Sender was already added, merge amounts, increase txs count
                oldamount = datadict['leasers'][sender]['amount']
                oldtimestamp = datadict['leasers'][sender]['timestamp'] # timestamp old previous lease
                
                if timestamp < oldtimestamp: # Newly found lease time is older then current written lease
                    oldtimestamp = timestamp # Overwrite with older lease tx time, this is the new value
                    oldmytime = get_time(oldtimestamp) # Overwrite with older lease tx time, this is the new value
                
                txs = datadict['leasers'][sender]['txs'] + 1
                datadict['leasers'][sender] = { 'amount' : oldamount+amount, 'txs' : txs, 'timestamp' : oldtimestamp, 'lease_start' : oldmytime }

        datadict['firstleaserblock'] = { 'blockid' : firstleaserblock, 'date' : get_time(oldestlease), 'address' : firstleaser } # This is the block with the first active leaser

        datadict['active_leases'] = activeleases # Set number of active leases

        totalwavesamount = datadict['reward_status']['totalWavesAmount']
        currentreward = datadict['reward_status']['currentReward']
        datadict['reward_status']['totalWavesAmount'] = str(totalwavesamount/math.pow(10, 8)) + ' Waves'
        datadict['reward_status']['currentReward'] = str(currentreward/math.pow(10, 8)) + ' Waves'

        for key in datadict['balances']: # Restructure balances output
            value = datadict['balances'][key]
            if type(value) == int:
                waves = value/math.pow(10, 8)
                datadict['balances'][key] = { 'wleds' : value, 'waves' : waves }

        for key in datadict['leasers']: # Restructure leaser data

            del datadict['leasers'][key]['timestamp'] # Not needed anymore
            amount = datadict['leasers'][key]['amount']/math.pow(10, 8) # waveleds to waves amount
            datadict['leasers'][key]['amount'] = amount

        d = datadict['leasers']

        def keyfunc(tup):
            key, d = tup
            return d["amount"], d["txs"]

        datadict['leasers'] = sorted(d.items(), key = keyfunc, reverse=True) # Sort list of leasers descending

        d = {}

    order_dict () # Organize some raw data in new format

    return datadict


class node:
    
    def __init__(self, wallet, cn):
       
        jsondict = get_blockchaindata() # Construct JSON dictionary with all queried blockchain data
        self.all = jsondict
        self.wallet = wallet # Wallet address
        self.version = jsondict['node_version']['version'] # Node software version
        self.blockchainheight = str(jsondict['node_status']['blockchainHeight']) # Lastblock height
        self.totalpeers = len(jsondict['all_peers']['peers']) # All blockchain peers
        self.connectedpeers = jsondict['connected_peers']['peers'] # Peers with a connected TCP session 
        self.activeleases = jsondict['active_leases'] # All active lease transactions to the node 
        self.leasers = len(jsondict['leasers']) # Total unique leasers
        self.recipients = jsondict['leasers'] # All unique lease addresses with amounts and lease txs
        self.aliasses = jsondict['address_aliasses'] # Aliasses for node wallet
        self.rewards = jsondict['reward_status'] # Block Reward status
        self.balances = jsondict['balances'] # Block Reward status
        self.firstleaseblock = jsondict['firstleaserblock'] # Block with first active leaser
        self.cn = cn # Control nodes configured for forktester
        
        
def present_overview(args):

    if args == 'help': exit()
    
    gb = nodeinfo.balances['generating']['waves']

    print()
    print(' Node software version           : ' + nodeinfo.version )
    print(' Wallet address                  : ' + nodeinfo.wallet)
    print(' Total / Connected peers         : ' + str(nodeinfo.totalpeers) + ' / ' + str(len(nodeinfo.connectedpeers)) )
    print(' Active leases to node           : ' + str(nodeinfo.activeleases) + ' [ generating balance : ' + str(gb) + ' Waves ]')
    print(' Total unique recipients         : ' + str(nodeinfo.leasers))
    print(' Oldest block with active leaser : height ' + str(nodeinfo.firstleaseblock['blockid']) + ', lease started : ' + nodeinfo.firstleaseblock['date'])
    print('                                   address \'' + str(nodeinfo.firstleaseblock['address']) + '\'')
    print(' Current block                   : height ' + nodeinfo.blockchainheight )
    print()
    print(' Waves balances')
    print(' -----------------------------------------------------------------')
    pp(nodeinfo.balances, indent=10)
    print()
    print(' Wallet address used         : ' + nodeinfo.wallet )
    print(' Address aliasses registered : -----------------------------------')
    pp(nodeinfo.aliasses, indent=31)
    print()

    if args == 'default':

        cnt = 0
        totamount = 0
        text = ""
   
        for address, obj in nodeinfo.recipients:
            a = address
            amount = obj['amount']
            if amount >= 750:
                totamount += amount 
                cnt += 1
                text += ' ' + address + str(obj) + '\n'
                
        print(' Showing leasers with amounts >= 750 Waves [ ' + str(cnt) + ' / ' + str(totamount) + ' Waves ]')
        print(' -----------------------------------------------------------------')
        print(text)

    print(' Block reward status') 
    print(' -----------------------------------------------------------------')
    pp(nodeinfo.rewards)

    if args == 'detail':
        print()
        print(' Leasing recipients, amount Waves, active lease txs')
        print(' -----------------------------------------------------------------')
        pp(nodeinfo.recipients)
        print()
        print(' Connected blockchain peers ( ' + str(len(nodeinfo.connectedpeers)) + ' established TCP sessions)')
        print(' -----------------------------------------------------------------')
         
        pp(nodeinfo.connectedpeers)



####################  START MAIN PROGRAM ####################

nodeinfo = node(wa, cn) # Iniate class node

present_overview(check_start_mode()) # Call presentation function, with cli argument

print()
#pp(nodeinfo.activeleases)
