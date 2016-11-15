const fs = require('fs'),
  http = require('http'),
  URL = require('url'),
  jsdom = require('jsdom'),
  openurl = require('openurl');

const BASE_DIR = '/Users/aaronding/projects/goodcompany/result/';
const PREFIX = '_e2';
const RUNNING_TIME = new Date().toJSON();
const RESULT_FILE = BASE_DIR + PREFIX + RUNNING_TIME + '.json';

const key = 'email';
const keys = ['firstName', 'lastName', 'ext', 'cell', 'alt', 'title', 'email'];
const ignoreKeys = [];

let loadHttp = url => {
  let options = URL.parse(url);

  options.headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.65 Safari/537.36'
  };

  return new Promise((resolve, reject) => {
    http.get(options, res => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve(body);
      });
    }).on('error', err => {
      reject(err);
    });
  });
};

let getDom = body => {
  return new Promise((resolve, reject) => {
    jsdom.env(body, ['https://code.jquery.com/jquery.js'], (err, window) => {
      if (err) {
        reject(err);
      } else {
        resolve(window);
      }
    });
  });
};

let getData = win => {
  return new Promise((resolve, reject) => {
    let $ = win.$;
    let all = $('table tr');

    let employees = [];

    for (let i = 0; i < all.length; i++) {
      let row = all[i];

      let td = $('td', row);
      if (!td.length) {
        continue;
      }
      let employee = {};
      for (let j = 0; j < td.length; j++) {
        let cell = td[j];
        employee[keys[j]] = $(cell).text();
      }
      employees.push(employee);
    }
    console.log('got ' + employees.length + ' employees.');
    resolve(employees);
  });
};

let getLast = (cur) => {
  console.log('looking for the last file');
  return new Promise((resolve, reject) => {
    fs.readdir(BASE_DIR, (err, files) => {

      if (err) {
        reject(err);
        return;
      }

      files = files.filter(file => {
        return file.startsWith(PREFIX);
      });

      if (files.length < 1) {
        resolve([null, cur]);
        return;
      }

      files.sort();
      let last = files.pop();
      fs.readFile(BASE_DIR + last, (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        console.log('found the last one:' + last);
        resolve([JSON.parse(data).cur, cur]);
      });
    });
  });
};

let compare = data => {
  console.log('comparing...');

  function compare(e1, e2) {
    let same = true,
      diff = {};
    keys.forEach(key => {
      if (ignoreKeys.indexOf(key) >= 0) {
        return;
      }
      if (e1[key] !== e2[key]) {
        diff[key] = e2[key];
        same = false;
      }
    });

    return same ? undefined : diff;
  }

  return new Promise((resolve, reject) => {
    let [last, cur] = data;

    let deleted = [], added = [], modified = [];
    let result = {
      deleted: deleted,
      added: added,
      modified: modified,
      last: last,
      cur: cur
    };

    if (!last) {
      console.log('no previous file');
      result.added = cur;
      resolve(result);
      return;
    }

    last.sort((c1, c2) => {
      if (c1[key] < c2[key]) {
        return -1;
      } else if (c1[key] > c2[key]) {
        return 1;
      } else {
        return 0;
      }
    });

    cur.sort((c1, c2) => {
      if (c1[key] < c2[key]) {
        return -1;
      } else if (c1[key] > c2[key]) {
        return 1;
      } else {
        return 0;
      }
    });

    let i = 0, j = 0;

    while (last[i] || cur[j]) {
      if (!last[i]) {
        added.push(cur[j]);
        j++;
        continue;
      }
      if (!cur[j]) {
        deleted.push(last[i]);
        i++;
        continue;
      }
      if (last[i][key] === cur[j][key]) {
        let diff = compare(last[i], cur[j]);
        if (diff) {
          modified.push({
            last: last[i],
            cur: diff
          });
        }
        i++;
        j++;
        continue;
      }

      if (last[i][key] < cur[j][key]) {
          deleted.push(last[i]);
          i++;
        } else {
          added.push(cur[j]);
          j++;
        }
      }

    console.log('compared');
    resolve(result);
  });
};

let generateReport = result => {
  let report = {};
  report.total = result.cur.length;
  report.addedCount = result.added.length;
  report.modifiedCount = result.modified.length;
  report.deletedCount = result.deleted.length;

  report.added = result.added;
  report.modified = result.modified;
  report.deleted = result.deleted;

  report.cur = result.cur;

  return report;
};

let processResult = result => {
  console.log('processing result');
  return new Promise((resolve, reject) => {
    if (result.added.length + result.deleted.length + result.modified.length > 0) {
      let report = generateReport(result);

      fs.writeFile(RESULT_FILE, JSON.stringify(report, null, 2), err => {
        if (err) {
          reject(err);
          return;
        }
        openurl.open(RESULT_FILE);
        console.log('processed');
        resolve(result);
      });
    } else {
      console.log('no changes found');
      resolve();
    }
  });
};

let run = () => {
  let url = 'http://10.30.0.201/etc/employees.php?sort=mail';
  loadHttp(url).then(getDom).then(getData).then(getLast).then(compare).then(processResult).then(result => {
    console.log('done');
  }, err => {
    console.log(err);
  });
};

run();