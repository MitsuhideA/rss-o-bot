'use strict';

var fs = require('fs');
var path = require('path');

var locations = [process.platform === 'win32' ? process.env.USERPROFILE + '/.rss-o-bot' : process.env.HOME + '/.rss-o-bot', '/etc/.rss-o-bot', __dirname + '/../config.json'].map(function (l) {
  return path.normalize(l);
});

var configError = 'No config file found!\nRTFM and put one in one of these locations:\n' + locations.join(', ') + '\n';

module.exports = {
  getTime: function getTime() {
    var mod = arguments.length <= 0 || arguments[0] === undefined ? 0 : arguments[0];

    return Math.round((new Date().getTime() + mod) / 1000);
  },
  getConfig: function getConfig() {
    var config = locations.filter(function (l) {
      try {
        return fs.statSync(l).isFile();
      } catch (e) {
        return false;
      }
    }).slice(0, 1).map(function (l) {
      return fs.readFileSync(l);
    }).map(function (c) {
      return JSON.parse(c);
    })[0];

    if (!config) {
      throw new Error(configError);
    }
    return config;
  },
  transformFilter: function transformFilter(filter) {
    return filter[0] === '!' ? { keyword: filter.substr(1), kind: false } : { keyword: filter, kind: true };
  }
};