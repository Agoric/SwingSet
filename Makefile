# run this in one shell:
start-app:
	rm -rf tmint-home
	bin/ag-cosmos-app.js

GETGCI=`cat tmint-home/config/gci.txt`

# then run these in a second shell
tx1:
	lotion send $(GETGCI) '{"index":0,"methodName":"getIssuer","args":[],"resultIndex":1}'

tx2:
	lotion send $(GETGCI) '{"index":1,"methodName":"makeEmptyPurse","args":["purse2"],"resultIndex":2}'

tx3:
	lotion send $(GETGCI) '{"index":2,"methodName":"deposit","args":[20,{"@qclass":"index","index":0}],"resultIndex":3}'

tx4:
	lotion send $(GETGCI) '{"index":2,"methodName":"getBalance","args":[],"resultIndex":4}'

tx5:
	lotion send $(GETGCI) '{"index":0,"methodName":"getBalance","args":[],"resultIndex":5}'
