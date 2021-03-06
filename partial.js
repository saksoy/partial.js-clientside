"use strict";

var LIMIT_HISTORY = 100;
var LIMIT_HISTORY_ERROR = 100;

var DOM = {};
var frameworkUtils = {};
var frameworkHandlers = {};

DOM.ready = function(fn) {

    var add = document.addEventListener || document.attachEvent;
    var rem =  document.removeEventListener || document.detachEvent;
    var name = document.addEventListener ? 'DOMContentLoaded' : 'onreadystatechange';

    var evt = function evt() {
        rem.call(document, name, evt, false);
        fn();
    };

    add.call(document, name, evt, false);
};

DOM.bind = function(el, type, name, fn) {

    if (typeof(el) === 'string')
        return DOM.bind(DOM.selector(el), type, name, fn);

    if (typeof(el.screen) === 'undefined') {
        if (typeof(el.length) !== 'undefined') {

            for (var i = 0; i < el.length; i++)
                DOM.bind(el[i], type, name, fn);

            return el;
        };
    }

    frameworkHandlers[name] = fn;

    if (el.addEventListener) {
        el.addEventListener(type, frameworkHandlers[name].bind(el), false);
        return el;
    }

    el.attachEvent('on' + type, function() {
        frameworkHandlers[name].apply(el, arguments);
    });

    return el;
};

var framework = {
    version: 101,
    routes: [],
    history: [],
    errors: [],
    events: {},
    eventsOnce: {},
    global: {},
    get: {},
    partials: {},
    repository: {},
    url: '',
    model: null,
    isFirst: true,
    isReady: false,
    isRefresh: false,
    isSkip: false,
    isModernBrowser: typeof(history.pushState) !== 'undefined',
    count: 0
};

/*
    Capture event
    @name {String}
    @fn {Function}
    return {Framework}
*/
framework.on = function(name, fn) {
    var self = this;

    var e = self.events[name];

    if (e) {
        e.push(fn);
        return self;
    }

    self.events[name] = [fn];
    return self;
};

framework.once = function(name, fn) {
    var self = this;

    var e = self.eventsOnce[name];

    if (e) {
        e.push(fn);
        return self;
    }

    self.eventsOnce[name] = [fn];
    return self;
};

/*
    Emit Event
    @name {String}
    return {Framework}
*/
framework.emit = function(name) {

    var self = this;
    var events = self.events[name] || [];
    var eventsOnce = self.eventsOnce[name] || [];
    var length = events.length;
    var lengthOnce = eventsOnce.length;

    if (length === 0 && lengthOnce === 0)
        return self;

    var params = [];
    var tmp = arguments.length;

    for (var i = 1; i < tmp; i++)
        params.push(arguments[i]);

    if (length > 0) {
        for (var i = 0; i < length; i++)
            events[i].apply(self, params);
    }

    if (lengthOnce > 0) {
        for (var i = 0; i < length; i++)
            eventsOnce[i].apply(self, params);
        delete self.eventsOnce[name];
    }

};

/*
    Route
    @url {String}
    @fn {Function}
    @partial {String Array} :: optional
    @once {Boolean} :: optional, default false
    return {Framework}
*/
framework.route = function(url, fn, partials, once) {

    var self = this;
    var priority = url.count('/') + (url.indexOf('*') === -1 ? 0 : 10);
    var route = self._route(url.trim());
    var params = [];

    if (typeof(partials) === 'boolean') {
        var tmp = once;
        once = partials;
        partials = once;
    }

    if (url.indexOf('{') !== -1) {

        for (var i = 0; i < route.length; i++) {
            if (route[i].substring(0, 1) === '{')
                params.push(i);
        }

        priority -= params.length;
    }

    self.routes.push({ url: route, fn: fn, priority: priority, params: params, partials: partials || null, once: once, count: 0 });

    self.routes.sort(function(a, b) {
        if (a.priority > b.priority)
            return -1;
        if (a.priority < b.priority)
            return 1;
        return 0;
    });

    return self;
};

framework.partial = function(name, fn) {
    var self = this;

    if (typeof(fn) === 'undefined') {

        if (name instanceof Array) {

            var length = name.length;
            for (var i = 0; i < length; i++) {
                var key = name[i];
                var partial = self.partials[key] || null;
                if (partial === null)
                    return;
                partial.call(self, self.url);
            }

            return self;
        }

        var partial = self.partials[name] || null;
        if (partial !== null)
            partial.call(self, self.url);

        return;
    };

    self.partials[name] = fn;
    return self;
};

framework.refresh = function() {
    var self = this;
    return self.location(self, true);
};

framework._route = function(url) {
    url = url.toLowerCase();

    if (url.charIndex(0) === '/')
        url = url.substring(1);

    if (url.charIndex(url.length - 1) === '/')
        url = url.substring(0, url.length - 1);

    var arr = url.split('/');
    if (arr.length === 1 && arr[0] === '')
        arr[0] = '/';

    return arr;
};

framework._route_param = function(routeUrl, route) {
    var arr = [];

    if (!route || !routeUrl)
        return arr;

    var length = route.params.length;
    if (length === 0)
        return arr;

    for (var i = 0; i < length; i++) {
        var value = routeUrl[route.params[i]];
        arr.push(value === '/' ? '' : value);
    }

    return arr;
};

framework._route_compare = function(url, route) {

    var length = url.length;
    var skip = length === 1 && url[0] === '/';

    if (route.length !== length)
        return false;

    for (var i = 0; i < length; i++) {

        var value = route[i];

        if (typeof(value) === 'undefined')
            return false;

        if (!skip && value.charIndex(0) === '{')
            continue;

        if (value === '*')
            return true;

        if (url[i] !== value)
            return false;
    }

    return true;
};

framework.location = function(url, isRefresh) {

    var index = url.indexOf('?');
    if (index !== -1)
        url = url.substring(0, index);

    url = frameworkUtils.prepareUrl(url);
    url = frameworkUtils.path(url);

    var self = this;
    var path = self._route(url);
    var routes = [];
    var notfound = true;

    self.isRefresh = isRefresh || false;
    self.count++;

    if (!isRefresh) {
        if (self.url.length > 0 && self.history[self.history.length - 1] !== self.url) {
            self.history.push(self.url);
            if (self.history.length > LIMIT_HISTORY)
                self.history.shift();
        }
    }

    var length = self.routes.length;
    for (var i = 0; i < length; i++) {

        var route = self.routes[i];
        if (!self._route_compare(path, route.url))
            continue;

        if (route.url.indexOf('*') === -1)
            notfound = false;

        if (route.once && route.count > 0)
            continue;

        route.count++;
        routes.push(route);
    }

    var isError = false;
    var error = [];

    self.url = url;
    self.repository = {};
    self._params();

    self.emit('location', url);
    length = routes.length;

    for (var i = 0; i < length; i++) {
        var route = routes[i];
        var lengthPartial = route.partials === null ? 0 : route.partials.length;
        if (lengthPartial > 0) {
            try
            {
                for (var j = 0; j < lengthPartial; j++) {
                    var partial = self.partials[route.partials[j]];
                    if (typeof(partial) === 'undefined')
                        continue;
                    partial.call(self, self.url);
                }
            } catch (ex) {
                isError = true;
                error += (error !== '' ? '\n' : '') + ex.toString();
                self.emit('error', ex, url, 'execute - partial');
            }
        }

        try
        {
            route.fn.apply(self, self._route_param(path, route));
        } catch (ex) {
            isError = true;
            error.push(ex);
            self.emit('error', ex, url, 'execute - route');
        }

    }

    if (isError)
        self.status(500, error);

    if (notfound)
        self.status(404, new Error('Route not found.'));
};

framework.back = function() {
    var self = this;
    var url = self.history.pop() || '/';
    self.url = '';
    self.redirect(url, true);
    return self;
};

framework.status = function(code, message) {
    var self = this;
    self.emit('status', code || 404, message);
    return self;
};

framework.redirect = function(url, model) {
    var self = this;

    if (!self.isModernBrowser) {
        window.location.href = '#!' + frameworkUtils.path(url);
        self.model = model || null;
        return self;
    }

    self.isSkip = true;
    history.pushState(null, null, url);
    self.model = model || null;
    self.location(url, false);

    return self;
};

framework.cookie = {
    read: function (name) {
        var arr = document.cookie.split(';');
        for (var i = 0; i < arr.length; i++) {
            var c = arr[i];
            if (c.charAt(0) === ' ')
                c = c.substring(1);
            var v = c.split('=');
            if (v.length > 1) {
                if (v[0] === name)
                    return v[1];
            }
        }
        return '';
    },
    write: function (name, value, expire) {
        var expires = '';
        var cookie = '';
        if (typeof (expire) === 'number') {
            var date = new Date();
            date.setTime(date.getTime() + (expire * 24 * 60 * 60 * 1000));
            expires = '; expires=' + date.toGMTString();
        } else if (expire instanceof Date)
            expires = '; expires=' + expire.toGMTString();
        document.cookie = name + '=' + value + expires + '; path=/';
    },
    remove: function (name) {
        this.write(name, '', -1);
    }
};

framework._params = function() {

    var self = this;
    var data = {};

    var params = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');

    for (var i = 0; i < params.length; i++) {

        var param = params[i].split('=');
        if (param.length !== 2)
            continue;

        var name = decodeURIComponent(param[0]);
        var value = decodeURIComponent(param[1]);
        var isArray = data[name] instanceof Array;

        if (typeof(data[name]) !== 'undefined' && !isArray)
            data[name] = [data[name]];

        if (isArray)
            data[name].push(value);
        else
            data[name] = value;
    }

    self.get = data;
    return self;
};


/*
    Get clean path
    @url {String}
    @d {String} :: delimiter, optional, default /
    return {String}
*/
frameworkUtils.path = function (url, d) {

    if (typeof (d) === 'undefined')
        d = '/';

    var index = url.indexOf('?');
    var params = '';

    if (index !== -1) {
        params = url.substring(index);
        url = url.substring(0, index);
    }

    var c = url.charIndex(url.length - 1);
    if (c !== d)
        url += d;

    return url + params;
};

/*
    @cb {Function}
*/
if (!Array.prototype.forEach) {
    Array.prototype.forEach = function (cb) {
        var arr = this;
        for (var i = 0; i < arr.length; i++)
            cb(arr[i], i);
        return arr;
    };
}

/*
    @cb {Function} :: return index
*/
if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function (value) {
        var arr = this;
        for (var i = 0; i < arr.length; i++) {
            if (value === arr[i])
                return i;
        }
        return -1;
    };
}

DOM.bind(window, 'popstate', 'popstate', function() {

    if (framework.count === 1 || framework.isSkip) {
        framework.isSkip = false;
        return;
    }

    var url = window.location.hash || '';
    if (url.length === 0)
        url = window.location.pathname;
    framework.location(frameworkUtils.path(url));
});

DOM.bind(window, 'hashchange', 'hashchange', function() {
    if (!framework.isReady)
        return;
    var url = window.location.hash || '';
    if (url.length === 0)
        url = window.location.pathname;
    framework.location(frameworkUtils.path(url));
});

if (navigator.appVersion.match(/MSIE.7|MSIE.8/) !== null) {
    setInterval(function() {

        if (!framework.isReady)
            return;

        var url = window.location.hash || '';
        if (url.length === 0)
            url = window.location.pathname;

        url = frameworkUtils.path(url);

        if (url !== framework.url)
            framework.location(url);

    }, 500);
}

if (!String.prototype.trim) {
    String.prototype.trim = function () {
        return this.replace(/^[\s]+|[\s]+$/g, '');
    };
}

if (!String.prototype.count) {
    String.prototype.count = function(text) {
        var index = 0;
        var count = 0;
        do {

            index = this.indexOf(text, index + text.length);

            if (index > 0)
                count++;

        } while (index > 0);
        return count;
    };
}

if (!String.prototype.charIndex) {
    String.prototype.charIndex = function(index) {
        return this.toString().substring(index, index + 1);
    };
}

frameworkUtils.path = function (url, d) {

    if (typeof (d) === 'undefined')
        d = '/';

    var index = url.indexOf('?');
    var params = '';

    if (index !== -1) {
        params = url.substring(index);
        url = url.substring(0, index);
    }

    var c = url.charIndex(url.length - 1);
    if (c !== d)
        url += d;

    return url + params;
};

frameworkUtils.prepareUrl = function(url) {

    var index = url.indexOf('#!');
    if (index !== -1)
        return url.substring(index + 2);

    return url;
};

framework.on('error', function (err, url, name) {
    var self = this;
    self.errors.push({ error: err, url: url, name: name, date: new Date() });
    if (self.errors.length > LIMIT_HISTORY_ERROR)
        self.errors.shift();
});

DOM.ready(function() {
    var url = window.location.hash || '';
    if (url.length === 0)
        url = window.location.pathname;
    framework.isReady = true;
    if (typeof(framework.events['ready']) === 'undefined')
        framework.location(frameworkUtils.path(frameworkUtils.prepareUrl(url)));
    else {
        var current = frameworkUtils.path(frameworkUtils.prepareUrl(url));
        framework.emit('ready', current);
        framework.emit('load', current);
    }
});