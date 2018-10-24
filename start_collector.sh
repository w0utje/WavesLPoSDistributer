#!/bin/bash
node=/usr/bin/node

# increase stacks and usable memory to 8GB
$node --stack-size=65565 --max-old-space-size=8192 appng.js
