"use strict";

let assert = require('chai').assert;
let co = require("co").wrap;
let consts = require("./consts.js");
let Promise = require("bluebird");

// we need this becaues test env is different than script env
let myWeb3 = (typeof web3 === undefined ? undefined : web3);

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

module.exports = {
  setWeb3: function(web3) {
    myWeb3 = web3;
  },

  afterFee: function(amount, serviceFeeInThousandths) {
    return amount / 1000 * (1000 - serviceFeeInThousandths);
  },

  assertEqualUpToGasCosts: function(actual, expected) {
      assert.closeTo(actual, expected, consts.MAX_GAS_COST_PER_TX);
  },

  assertThrows: function(promise, err) {
    return promise.then(function() {
      assert.isNotOk(true, err);
    }).catch(function(e) {
      assert.include(e.message, 'invalid JUMP', "contract didn't throw as expected");
    });
  },

  createROSCA: function(ERC20Address, ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
                        MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS) {
    this.mineOneBlock(); // mine an empty block to ensure latest's block timestamp is the current Time

    let latestBlock = web3.eth.getBlock("latest");
    let blockTime = latestBlock.timestamp;
    return ROSCATest.new(
        ERC20Address,
        ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, blockTime + START_TIME_DELAY, MEMBER_LIST,
        SERVICE_FEE_IN_THOUSANDTHS);
  },

  createEthROSCA: function(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
                           MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS) {
    return this.createROSCA(0 /* use ETH */, ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE,
                            START_TIME_DELAY, MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);
  },

  createERC20ROSCA: co(function* (ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
                                 MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS, accountsToInjectTo) {
    let exampleToken = yield ExampleToken.new(accountsToInjectTo || []);
    return this.createROSCA(exampleToken.address, ROUND_PERIOD_IN_SECS,  // eslint-disable-line no-invalid-this
                              CONTRIBUTION_SIZE, START_TIME_DELAY, MEMBER_LIST,
                              SERVICE_FEE_IN_THOUSANDTHS);
  }),

  // Currency-agnostic
  contractNetCredit: function* (rosca) {
    let tokenContract = yield rosca.tokenContract.call();
    if (tokenContract == ZERO_ADDRESS) {
      return web3.eth.getBalance(rosca.address).toNumber() - (yield rosca.totalFees.call()).toNumber();
    }
    return (yield ExampleToken.at(tokenContract).balanceOf(rosca.address)) - (yield rosca.totalFees.call()).toNumber();
  },

  // Currency-agnostic
  contribute: function(rosca, from, value) {
    return rosca.tokenContract.call().then((tokenContract) => {
      if (tokenContract !== ZERO_ADDRESS) {  // This is an ERC20 contract. Approve and contribute.
        return ERC20TokenInterface.at(tokenContract).approve(rosca.address, value, {from: from}).then(() => {
          return rosca.contribute({from: from, gas: 2e6});
        });
      }
      // This is an ETH contract. Only need to call contribute.
      return rosca.contribute({from: from, value: value});
    });
  },

  getBalance: co(function* (account, tokenContract) {
    if (!tokenContract || tokenContract === ZERO_ADDRESS) {
      return web3.eth.getBalance(account).toNumber();
    }
    let balance = (yield ExampleToken.at(tokenContract).balanceOf(account)).toNumber();
    return balance;
  }),

  getGasUsage: function(transactionPromise, extraData) {
    return new Promise(function(resolve, reject) {
      transactionPromise.then(function(txId) {
        resolve({
          gasUsed: myWeb3.eth.getTransactionReceipt(txId).gasUsed,
          extraData: extraData,
        });
      }).catch(function(reason) {
        reject(reason);
      });
    });
  },

  increaseTime: function(bySeconds) {
    myWeb3.currentProvider.send({
      jsonrpc: "2.0",
      method: "evm_increaseTime",
      params: [bySeconds],
      id: new Date().getTime(),
    });
  },

  mineOneBlock: function() {
    myWeb3.currentProvider.send({
      jsonrpc: "2.0",
      method: "evm_mine",
      id: new Date().getTime(),
    });
  },
};
