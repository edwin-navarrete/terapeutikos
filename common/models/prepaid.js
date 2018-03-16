'use strict';

var app = require('../../server/server');

module.exports = function(Prepaid) {
  Prepaid.observe('before save', function updateTimestamp(ctx, next) {
    const now = new Date();
    if (ctx.instance) ctx.instance.updated = now;
    else ctx.data.updated = now;
    next();
  });

  Prepaid.prototype.serve = function(options, cb) {
    const ServiceLog = app.models.ServiceLog;
    const token = options && options.accessToken;
    const userId = token && token.userId;
    const self = this;
    if (self.status != 'waiting') {
      return cb(null, self);
    }
    app.models.User.findById(userId, function(err, usr) {
      console.log('Served by ', usr);
      const now = new Date();
      self.servedUnits += 1;
      self.status = 'ready';
      self.serviceLogs.build({
        agent: usr.email,
      }).save();
      if (self.servedUnits >= self.totalUnits) {
        self.status = 'finished';
        self.serviceLogs.build({
          status: 'finished',
        }).save();
      }
      const request = self.contactRequest;
      self.contactRequest = null;
      self.save();
      // TODO notify customer
      cb(null, Object.assign(self, {
        agent: usr.email,
        request: request,
      }));
    });
  };

  Prepaid.prototype.request = function(name, phone, email, cb) {
    if (this.status == 'waiting' || this.status == 'finished')
      return cb(null, this);

    // TODO Notify all agents
    const now = new Date();
    this.status = 'waiting';
    this.contactRequest = {
      name: name, phone: phone, email: email,
    };
    this.serviceLogs.build({
      request: this.contactRequest,
      timestamp: now,
    }).save();
    this.save();
    cb(null, this);
  };
  Prepaid.remoteMethod(
    'prototype.request', {
      http: {
        path: '/request',
        verb: 'post',
      },
      accepts: [
        {
          arg: 'name', type: 'string',
        },
        {
          arg: 'phone', type: 'string',
        },
        {
          arg: 'email', type: 'string',
        }],
      returns: {
        arg: 'status',
        type: 'object',
      },
    }
  );
  Prepaid.remoteMethod(
    'prototype.serve', {
      accepts: [{
        arg: 'options', type: 'object', http: 'optionsFromRequest',
      }],
      http: {
        path: '/serve',
        verb: 'post',
      },
      returns: {
        arg: 'status',
        type: 'object',
      },
    }
  );
};
