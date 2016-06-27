#!/usr/bin/env node
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

function _toArray(arr) { return Array.isArray(arr) ? arr : Array.from(arr); }

/**
 * cli
 * The executable configured by the package.
 */

var fs = require('fs');

var _require = require('./lib/helpers');

var getConfig = _require.getConfig;
var getPrivateKey = _require.getPrivateKey;
var getPublicKey = _require.getPublicKey;
var setPublicKey = _require.setPublicKey;
var transformFilter = _require.transformFilter;
var buildMan = _require.buildMan;
var printFeeds = _require.printFeeds;
var getMode = _require.getMode;

var config = getConfig();
var initStore = require('./lib/store');
var notify = require('./lib/notify')(config);
var opml = require('./lib/opml');

var _require2 = require('rx');

var O = _require2.Observable;

var client = require('./lib/client');
var server = require('./lib/server');
var genKeys = require('./lib/genKeys');
var debug = require('debug')('rss-o-bot');

var CLIENT_ONLY = Symbol('CLIENT_ONLY');

process.title = 'rss-o-bot';

var commands = [['add', function (args) {
  return !!args[0];
}, function (_ref) {
  var _ref2 = _toArray(_ref);

  var url = _ref2[0];

  var filters = _ref2.slice(1);

  return initStore(config).flatMap(function (_ref3) {
    var insertFeed = _ref3.insertFeed;
    return insertFeed(url, filters.map(transformFilter));
  });
}], ['rm', function (args) {
  return !!args[0];
}, function (_ref4) {
  var _ref5 = _slicedToArray(_ref4, 1);

  var id = _ref5[0];
  return initStore(config).flatMap(function (_ref6) {
    var removeFeed = _ref6.removeFeed;
    return removeFeed(id);
  });
}], ['list', true, function () {
  return initStore(config).flatMap(function (_ref7) {
    var listFeeds = _ref7.listFeeds;
    return listFeeds();
  }).flatMap(printFeeds);
}], ['poll-feeds', true, function () {
  return initStore(config).flatMap(function (s) {
    return require('.').pollFeeds(s, true);
  });
}], ['test-notification', true, function (args) {
  return notify('Test', args[0] || 'test', 'Test Title');
}], ['import', function (args) {
  return !!args[0];
}, function (_ref8) {
  var _ref9 = _slicedToArray(_ref8, 1);

  var file = _ref9[0];
  return initStore(config).flatMap(opml.import(file)).flatMap(printFeeds);
}], ['export', true, function () {
  return initStore(config).flatMap(opml.export);
}], [['run'], true, function () {
  return O.create(function (o) {
    require('.')();
  });
}], [['-h', '--help', 'help'], true, function () {
  return O.create(function (o) {
    o.onNext(buildMan().synopsis + 'Please refer to `man rss-o-bot`, `rss-o-bot --manual` or the README for further instructions.');
    o.onCompleted();
  });
}], [['-m', '--manual', '--man', 'manual'], true, function () {
  return O.create(function (o) {
    o.onNext(buildMan().raw);
    o.onCompleted();
  });
}], [['-v', '--version', 'version'], true, function () {
  return O.create(function (o) {
    var packageInfo = require('../package.json');
    o.onNext('RSS-o-Bot Version: ' + packageInfo.version);
    o.onCompleted();
  });
}], ['build-man', true, function () {
  return O.create(function (o) {
    fs.writeFileSync(__dirname + '/../dist/man/rss-o-bot.1', buildMan().man);
    o.onNext('Man built');
    o.onCompleted();
  });
}, CLIENT_ONLY], ['ping', true, function () {
  return O.create(function (o) {
    if (getMode() === 'local') {
      o.onNext('No server configured, running in local mode. Check the configuration section of the man-page for more info.');
      o.onCompleted();
    } else if (getMode() === 'remote') {
      client.send({ action: 'ping', args: [] }).subscribe(function (msg) {
        return o.onNext(msg);
      }, function (err) {
        return o.onNext(err);
      }, function () {
        return o.onCompleted();
      });
    } else if (getMode() === 'server') {
      o.onNext('pong');
      o.onCompleted();
    }
  });
}, CLIENT_ONLY]];

var executeCommand = function executeCommand(commands, action, args) {
  return command ? command[2](args) : O.create(function (o) {
    return o.onError('Unrecognized action: ' + action + '\n ' + buildMan().synopsis);
  });
};

var action = process.argv[2];
var args = process.argv.slice(3);
var findCommand = function findCommand(commands, action, args) {
  return commands.find(function (_ref10) {
    var _ref11 = _slicedToArray(_ref10, 3);

    var command = _ref11[0];
    var validator = _ref11[1];
    var run = _ref11[2];
    return ((typeof command === 'undefined' ? 'undefined' : _typeof(command)) === 'object' ? command.indexOf(action) > -1 : command === action) && (typeof validator === 'function' ? validator(args) : validator);
  });
};

var command = findCommand(commands, action, args);
if (getMode() === 'local' || command && command[3] === CLIENT_ONLY) {
  debug('running command locally');
  executeCommand(command, action, args).subscribe(console.log, console.error);
} else if (getMode() === 'remote') {
  debug('Sending command as remote');
  if (!getPrivateKey()) {
    try {
      debug('Generating new key pair');
      genKeys();
      client.send({ key: getPublicKey() }, true);
    } catch (e) {
      throw new Error('Failed to generate key pair. Automatic generation might work if you install OpenSSL. If you have already installed it and are still unable to initialize RSS-o-Bot, please generate a keypair manually.refer to the manual for more information');
    }
  }
  client.send({ action: action, args: args }).subscribe(console.log, console.error);
} else if (getMode() === 'server') {
  debug('Starting server');
  server.listen().subscribe(function (_ref12) {
    var _ref13 = _slicedToArray(_ref12, 2);

    var data = _ref13[0];
    var respond = _ref13[1];

    debug('Recieved public key');
    if (typeof data === 'string') {
      // Must be a public key
      setPublicKey(data);
    } else {
      debug('Executing command ' + data.action);
      var _action = findCommand(commands, data.action, data.args);
      executeCommand(_action, data.args).subscribe(respond, respond);
    }
  });
}