const fs = require('fs'),
  http = require('http'),
  URL = require('url'),
  jsdom = require('jsdom'),
  openurl = require('openurl');

const BASE_DIR = '/tmp/goodcompany/';
const RESULT_FILE_NAME = 'result.json';
const REPORT_FILE_NAME = 'report';
const RESULT_FILE = BASE_DIR + RESULT_FILE_NAME;
const REPORT_FILE = BASE_DIR + REPORT_FILE_NAME;
const PREFIX = '_e';

const keys = ['firstName', 'lastName', 'ext', 'cell', 'alt', 'title', 'email'];

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
    jsdom.env(body, ['http://code.jquery.com/jquery.js'], (err, window) => {
      if (err) {
        reject(err);
      } else {
        resolve(window);
      }
    });
  });
};

let getEmployees = win => {
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

let save = json => {
  console.log('saving... file');
  return new Promise((resolve, reject) => {
    fs.mkdir(BASE_DIR, () => {
      fs.writeFile(BASE_DIR + PREFIX + new Date().getTime(), JSON.stringify(json), err => {
        if (err) {
          reject(err);
          return;
        }
        console.log('file saved');
        resolve(json);
      });
    });
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
        return file.substr(0, 2) === PREFIX;
      });

      if (!files.length) {
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

        console.log('found the last one');
        resolve([JSON.parse(data), cur]);
      });
    });
  });
};

let compare = data => {
  console.log('comparing...');

  function compareEmployee(e1, e2) {
    let same = true;
    keys.forEach(key => {
      if (e1[key] !== e2[key]) {
        same = false;
      }
    });

    return same;
  }

  return new Promise((resolve, reject) => {
    let [last, cur] = data;

    let deleted = [], added = [], modified = [];
    let result = {
      deleted: deleted,
      added: added,
      modified: modified
    };

    if (!last) {
      console.log('no previous file');
      resolve(result);
      return;
    }

    let i = 0, j = 0;

    while (last[i] || cur[j]) {
      if (last[i].email === cur[j].email) {
        if (!compareEmployee(last[i], cur[j])) {
          modified.push({
            last: last[i],
            cur: cur[j]
          });
        }
        i++;
        j++;
      } else {
        if (last[i].email < cur[j].email) {
          deleted.push(last[i]);
          i++;
        } else {
          added.push(cur[j]);
          j++;
        }
      }
    }

    console.log('compared');
    resolve(result);
  });
};

let processResult = result => {
  console.log('processing result');
  return new Promise((resolve, reject) => {
    fs.writeFile(RESULT_FILE, JSON.stringify(result, null, 2), err => {
      if (err) {
        reject(err);
        return;
      }

      console.log('processed');
      resolve(result);
    });
  });
};

let run = () => {
  loadHttp('http://10.30.0.201/etc/employees.php?sort=mail')
    .then(getDom).then(getEmployees).then(save).then(getLast).then(compare).then(processResult).then(result => {

    let report = `${result.deleted.length} deleted, ${result.added.length} added, ${result.modified.length} modified`;
    fs.writeFile(REPORT_FILE, report, err => {
      if (!err) {
        openurl.open(REPORT_FILE);
        console.log('done');
      }
    });
  }, err => {
    console.log(err);
  });
};

run();