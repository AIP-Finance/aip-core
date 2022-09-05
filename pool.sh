#!/bin/bash
filename="contracts/libraries/PoolAddress.sol"
search="REPLACE_TEXT"

echo $1

sed -iE 's/0x[a-z0-9]\{64\}/'$1'/g' $filename
# sed -i .bak 's/\b[a-z0-9]\{64\}\b/$1/g' $filename