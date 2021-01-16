#! /usr/bin/env python3

# This tool will get a list of waves blockchain peers
# It then tries to see if API is open
# Result output to screen
# The open nodes found, can be added to the config.json file of WavesLPOSdistributer
# This is a comma seperated list of json key "controlnodes" : { "http://1.4.6.9:80",
#                                                               "http://88.3.1.2:6869" },
# The list of controlnodes will be used by tool 'forktester.py' to compare
# blocks headers from your own node against the control nodes.
# The result will report if a fork happened.


import json
import urllib3
import pprint
import time
import collections
import urllib.error

configfile = "config.json"
https = urllib3.PoolManager()
pp = pprint.pprint
gettimeout = 2.0 #Waiting time before declare unsuccesfull GET
getpause = 1 #seconds timeout between succesfull GET
getretry = 1 #How many retries if timeout occurs

connected_peers = '/peers/connected' #API uri to get all connected waves peers
node_status = '/node/status' #API uri to get node status
node_wallet = '/addresses' #API uri to get a nodes wallet address
genbalance_baseuri = '/consensus/generatingbalance' #API to get the generating waves balance
api_ports = [ 6869, 80 ] #List with all ports to test if a node API is open on that port

# read and set variables from config file
with open(configfile, "r") as json_file:

    jsonconfigdata = json.load(json_file)
    ftconf = jsonconfigdata["forktoolsconfig"]
    tgconf = jsonconfigdata["telegramconfig"]
    pconf = jsonconfigdata["paymentconfig"]
    cn = ftconf["controlnodes"]
    auto_rollback = ftconf['auto_rollback']
    mynode = jsonconfigdata["paymentconfig"]["querynode_api"]


# Function that GETs specified API request
# params:
# - node : the node to use ('http(s)://name:port')
# - uri  : api uri
def get_req(node, uri, reqtimeout, retry):

    getreq = https.request('GET', node + uri, timeout=reqtimeout, retries=retry) 
    return getreq


# Function that GETs all connected Waves nodes
# It returns a list with all node IP addresses
def get_peers():

    try:
        cpeers = get_req(mynode, connected_peers, gettimeout, getretry)
        nodelist = []
        status = cpeers.status
        data = json.loads(cpeers.data)
        if status == 200: #Succesfull received peer list
            for peer in data['peers']: #Scan all peers
                ipaddress = peer['address'].strip('/').split(':')
                ipaddress.pop()
                nodelist += ipaddress #Add clean IP address to list
        
        if len(nodelist) == 0:
            print(' Nodelist empty. Nothing to do, exit')
            exit()
        else:
            return nodelist
    except:
        print(' Could not retreive list with peers from node : ' + mynode + '. Exit')
        exit()


# Function that queries all nodes from the nodelist on spefified ports
# If succesfull answer op a ports, GET the waves gen.balance
# Print summary report with only open nodes, that have gen.balance > 0
# params:
# - nodelist: list with ip addresses [ '1.2.3.4', '6.7.8.9' ]
def check_node_ports(nodelist):

    summary = ''
    cnt = 0
    opennodes = 0

    for ip in nodelist:
        cnt += 1
        node = 'http://' + str(ip) + ':'
        openport = 0

        print('\n Trying node ' + node)
        for port in api_ports:
            node = node + str(port)
            
            try:
                nodestatus = get_req(node, node_status, gettimeout, getretry)
                status = nodestatus.status
                if status == 200: #Port accessable

                    openport += 1
                    wallet = get_req(node, node_wallet, gettimeout, getretry) #Get the wallet address
                    data = json.loads(wallet.data) #Wallet address
                    balance_uri = genbalance_baseuri + '/' + data[0]
                    genbalance = get_req(node, balance_uri, gettimeout, getretry) #Get the wallet waves balance 
                    data = json.loads(genbalance.data)
                    genbalance = round(data['balance']/pow(10, 8)) #Generating Waves balance (rounded)
                    print('  - API on port ' + str(port) + ' is open.')

                    if genbalance > 0:
                        summary += ' node ' + ip.ljust(16) + '|API port open ' + str(port).ljust(6) + '| Gen.balance: ' + str(genbalance).ljust(9) + \
                                   ' ==> config.json, key "controlnodes", add: ' + node + '" : "up"\n'
   
            except: #timeout or other error
                print('  - API on port ' + str(port) + ' is unreachable.')

            time.sleep(getpause)
        
        if openport > 0: #increase opennode counter
            opennodes += 1

        #if cnt == 15: break #Break loop after low count for testing
    
    #Finished all nodes from nodelist, print
    print('\n\n Finshed. Scanned ' + str(len(nodelist)) + ' nodes. ' + str(opennodes) + ' nodes open.')
    print(' You are flexible in your selection if you want to use a node.')
    print('\n Multiple nodes can be added as comma seperated list to "controlnodes", i.e. { "http://1.2.3.4:6869" : "up",')
    print('                                                                               "http://5.6.7.8:6889" : "up" },')
    print('\n ============================= showing only nodes with a generating balance > 0 Waves ===================================\n')
    print(summary)


##### MAIN PROGRAM #####

peers = get_peers() #Create list with all connected peers
check_node_ports(peers) #Check which peers have API server reachable

