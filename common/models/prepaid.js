'use strict';

var app = require('../../server/server');
var ejs = require('ejs');
var async = require('async');

module.exports = function(Prepaid) {

  Prepaid.observe('before save', function updateTimestamp(ctx, next) {
    const now = new Date();
    if (ctx.instance) ctx.instance.updated = now;
    else ctx.data.updated = now;
    next();
  });

  Prepaid.observe('after save', function updateTimestamp(ctx, next) {
    var data = ctx.instance || ctx.data
    // Send receipt to client      
    var host = (app && app.get('host')) || 'localhost';
    var port = (app && app.get('port')) || 3000;
    data.requestUrl = `http://${host}:${port}/service_request?payment=${data.id}`;
    console.log('renderDat', data);
    ctx.isNewInstance && ejs.renderFile('./server/views/receipt.ejs', data,
      function(err, html) {
        if (err) return next(err)
        console.log('> sending receipt email to:', data.contactEmail);
        app.models.Email.send({
          to: data.contactEmail,
          from: "terapeutikos@gmail.com",
          subject: 'Bienvenido a Terapéutikos',
          html: html
        }, function(err) {
          if (err) console.error('> error sending receipt email', err);
          next(err);
        });
      })
  });

  Prepaid.prototype.serve = function(options, cb) {
    const ServiceLog = app.models.ServiceLog;
    const token = options && options.accessToken;
    const userId = token && token.userId;
    const self = this;
    if (self.servedBy) {
      return cb(null, self);
    }
    app.models.Agent.findById(userId, function(err, usr) {
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
      self.servedBy = usr.email;
      self.servedOn = now;
      self.save();
      // TODO notify customer
      cb(null, Object.assign(self, {
        agent: usr.email,
        request: request,
      }));
    });
  };

  Prepaid.prototype.request = function(req, cb) {
    if (this.status == 'waiting' || this.status == 'finished') {
      return cb(null, this);
    }

    var self = this
    const now = new Date();
    // Notify all agents
    const host = (app && app.get('host')) || 'localhost';
    const port = (app && app.get('port')) || 3000;
    const emailData = { requestUrl: `http://${host}:${port}/` }
    app.models.Agent.find({ fields: { email: true } }, function(err, agnts) {
      if (err) return console.error(err);
      async.each(agnts, function(agnt, callb) {
        ejs.renderFile('./server/views/newService.ejs', emailData,
          function(err, html) {
            if (err) return next(err)
            console.log('> notify email to:', agnt.email);
            app.models.Email.send({
              to: agnt.email,
              from: "terapeutikos@gmail.com",
              subject: 'Terapéutikos - Nuevo servicio ' + now.toLocaleString(),
              html: html
            }, callb);
          })
      }, (err) => err && console.error('> error sending new service email', err))
    })
    // Save the request
    self.status = 'waiting';
    req.ts = now;
    self.contactRequest = req;
    self.serviceLogs.build({
      request: self.contactRequest,
      timestamp: now,
    }).save();
    self.servedBy = null;
    self.servedOn = null;
    self.save();
    cb(null, self);
  };

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
