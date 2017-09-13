var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');
var session = require('express-session');

var bcrypt = require('bcrypt-nodejs'); // we added
var cookieSession = require('cookie-session');

var app = express();

app.set('trust proxy', 1);
app.use(cookieSession({
  name:'session',
  keys: ['bob']
}))

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));


app.get('/', checkUser, function(req, res) {
  res.render('index');
});

app.get('/create', checkUser, function(req, res) {
  res.render('index');
});

app.get('/links', checkUser, function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.status(200).send(links.models);
  });
});

app.post('/links', checkUser, function(req, res) {
  var uri = req.body.url;
  console.log(uri);
  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/
app.get('/login', function(req,res) {
  console.log('before session',req.session);
  res.render('login');
});

app.post('/login', function(req,res) {
  var found = User.where( {
       username: req.body.username
     }).fetch().then( (user) => {
      //console.log('ID of user found',user);
       if(user !== null) {
         bcrypt.compare(req.body.password, user.attributes.password, function(err, result) {
           console.log('result in compare',result, err, user.attributes.password);
           if(!result) {
             res.redirect('/login');
           } else {
             req.session.username = req.body.username;
             req.session.password = req.body.password;
             res.redirect('/');
           }
         });
       } else {
         res.redirect('/signup');
       }
       //console.log('after stuff session', req.session);
     })
});

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.post('/signup', function(req, res) {
  new User({
    'username': req.body.username,
    'password': req.body.password
  }).save().then(function(model) {
    req.session.username = req.body.username;
    req.session.password = req.body.password;
    res.redirect('/');
  }).catch(function(err) {
    console.log('*******************************', err)
  });
})

app.get('/logout', function(req, res) {
  req.session = null;
  res.redirect('/login');
})

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

function checkUser(req, res, next) {
  console.log('req.session',req.session, req.url);
  if(req.session.username && req.session.password) {
    User.where( {
        username: req.session.username
      }).fetch().then( (user) => {
        bcrypt.compare(req.session.password, user.attributes.password, function(err, result) {
          if(!result) {
            res.redirect('/login');
          } else {
            next();
          }
        });
      })
  } else {
    res.redirect('/login');
  }
}

module.exports = app;
