var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var flash = require('express-flash');
var session = require('express-session');

function ensureLogin(req, res, next) {
    if (req.path.startsWith('/logres')) return next();
    if (req.session && req.session.user) return next();
    return res.redirect('/logres');
}

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var logresRouter = require('./routes/logres');
var profileRouter = require('./routes/profile');


var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    cookie: {
        maxAge: 60000
    },
    store: new session.MemoryStore,
    saveUninitialized: true,
    resave: 'true',
    secret: 'secret',
    cookie: { maxAge: 1000 * 60 * 60 * 4 }
}))

app.use((req, res, next) => {
    res.locals.user = req.session && req.session.user ? req.session.user : null;
    next();
});


app.use(flash());
app.use('/profile', ensureLogin, profileRouter);
app.use('/', ensureLogin, indexRouter);
app.use('/users', usersRouter);
app.use('/logres', logresRouter);


// catch 404 and forward to error handler
app.use(function(req, res, next) {
    next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;