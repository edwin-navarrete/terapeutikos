// Copyright IBM Corp. 2014,2015. All Rights Reserved.
// Node module: loopback-example-user-management
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

var dsConfig = require('../datasources.json');
var path = require('path');
var _ = require('lodash');

module.exports = function(app) {
  var Agent = app.models.Agent;

  //login page
  app.get('/', function(req, res) {
    var credentials = dsConfig.emailDs.transports[0].auth;
    res.render('login', {
      email: credentials.user,
      password: ""
    });
  });

  //verified
  app.get('/verified', function(req, res) {
    res.render('verified');
  });

  //log a user in
  app.post('/login', function(req, res) {
    Agent.login({
      email: req.body.email,
      password: req.body.password
    }, 'user', function(err, token) {
      if (err) {
        if (err.details && err.code === 'LOGIN_FAILED_EMAIL_NOT_VERIFIED') {
          res.render('reponseToTriggerEmail', {
            title: 'Falló el Ingreso',
            content: err,
            redirectToEmail: '/api/Agents/' + err.details.userId + '/verify',
            redirectTo: '/',
            redirectToLinkText: 'Clic acá',
            userId: err.details.userId
          });
        } else {
          res.render('response', {
            title: 'Falló el Ingreso. Contraseña y/o nombre de usuario incorrectos.',
            content: err,
            redirectTo: '/',
            redirectToLinkText: 'Por favor intente de nuevo',
          });
        }
        return;
      }
      res.redirect('/home?access_token=' + token.id)
    });
  });

  //log a user out
  app.get('/logout', function(req, res, next) {
    if (!req.accessToken) return res.sendStatus(401);
    Agent.logout(req.accessToken.id, function(err) {
      if (err) return next(err);
      res.redirect('/');
    });
  });

  //send an email with instructions to reset an existing user's password
  app.post('/request-password-reset', function(req, res, next) {
    Agent.resetPassword({
      email: req.body.email
    }, function(err) {
      if (err) return res.status(401).send(err);

      res.render('response', {
        title: 'Petición de cambio de constraseña',
        content: 'Revise su correo para más instrucciones',
        redirectTo: '/',
        redirectToLinkText: 'Ingresar'
      });
    });
  });

  //show home 
  app.get('/home', function(req, res, next) {
    if (!req.accessToken) return res.redirect('/');
    app.models.Prepaid.find(
      { filter: { where: {} }, order: 'updated DESC' },
      function(err, payments) {
        if (err) return console.error(err);
        var now = Date.now();
        var today = Math.trunc(now / 86400000) * 86400000;
        var services = payments.filter((p) => p.status == 'waiting' || p.servedOn > today)
          .sort((x, y) => {
            if (x.status == 'waiting' && y.status == 'waiting')
              return x.contactRequest.ts - y.contactRequest.ts
            else if (x.status == 'waiting')
              return -1
            else if (y.status == 'waiting')
              return 1
            return x.servedOn - y.servedOn
          })
          .map((x) => {
            x.status == 'waiting' && (x.elapsed = Math.round((now - x.contactRequest.ts) / 60000));
            return x;
          });
        res.render('home', {
          accessToken: req.accessToken.id,
          services: services,
          payments: payments
        });
      });
  });

  //show password reset form
  app.get('/reset-password', function(req, res, next) {
    if (!req.accessToken) return res.sendStatus(401);
    res.render('password-reset', {
      redirectUrl: '/api/Agents/reset-password?access_token=' +
        req.accessToken.id
    });
  });

  //show change password form
  app.get('/change-password', function(req, res, next) {
    if (!req.accessToken) return res.sendStatus(401);
    res.render('password-change', {
      accessToken: req.accessToken.id
    });
  });

  //show create payment form
  app.get('/new-payment', function(req, res, next) {
    if (!req.accessToken) return res.sendStatus(401);
    res.render('payment_new', {
      accessToken: req.accessToken.id
    });
  });

  // almacenar un pago
  app.post('/payment-save', function(req, res, next) {
    if (!req.accessToken) return res.sendStatus(401);
    delete req.body.accessToken;
    app.models.Prepaid.upsert(req.body, function(err, data) {
      res.render('response', {
        title: err ? 'Error' : 'Pago almacenado',
        content: err || 'El pago se guardó correctamente y el recibo fué enviado por correo al cliente',
        redirectTo: `/home?access_token=${req.accessToken.id}`,
        redirectToLinkText: 'Volver al inicio',
      });
    })
  });

  // show request service form
  app.get('/service_request', function(req, res, next) {
    var credentials = dsConfig.emailDs.transports[0].auth;
    var errorMsg = {
      title: 'Lo sentimos',
      content: 'Comunícate con nosotros para poder ayudarte.',
      redirectTo: `mailto:${credentials.user}?Subject=Ayuda`,
      redirectToLinkText: 'Contáctanos por correo',
    }
    if (!req.query.payment) {
      errorMsg.content = 'La identificación de servicio es inválida.' + errorMsg.content;
      res.render('response', errorMsg);
      return;
    }
    app.models.Prepaid.findById(req.query.payment, function(err, payment) {
      if (err) {
        console.error('service_request error', err);
        errorMsg.content = 'No fue posible validar tu servicio.' + errorMsg.content;
      }
      else if (payment.term <= new Date())
        errorMsg.content = 'Tu servicio ya no está vigente.' + errorMsg.content;
      else if (payment.totalUnits <= payment.servedUnits)
        errorMsg.content = 'Ya has alcanzado el límite de atenciones de tu servicio.' + errorMsg.content;
      else if (payment.status == 'finished')
        errorMsg.content = 'Tu servicio no está activo.' + errorMsg.content;
      else
        errorMsg = null;

      if (errorMsg) res.render('response', errorMsg);
      else res.render('service_request', {
        payment: req.query.payment
      });
    })
  });

  // Requerimiento de servicio enviado
  app.post('/service-request', function(req, res, next) {
    var credentials = dsConfig.emailDs.transports[0].auth;
    var errMsg = {
      title: 'Lo sentimos',
      content: 'Comunícate con nosotros para poder ayudarte.',
      redirectTo: `mailto:${credentials.user}?Subject=Ayuda`,
      redirectToLinkText: 'Contáctanos por correo',
    }

    app.models.Prepaid.findById(req.body.payment, function(err, payment) {
      if (err) {
        console.error('POST service_request error', err);
        errMsg.content = 'No pudimos validar la identificación de tu servicio.' + errMsg.content;
      } else if (payment.status == 'waiting') {
        errMsg.content = 'Estamos procesando otra de tus solicitudes, por favor intenta más tarde.' + errMsg.content;
      } else if (payment.term <= new Date()) {
        errMsg.content = 'Tu servicio ya no está vigente.' + errMsg.content;
      } else if (payment.totalUnits <= payment.servedUnits) {
        errMsg.content = 'Ya has alcanzado el límite de atenciones de tu servicio.' + errMsg.content;
      } else if (payment.status == 'finished') {
        errMsg.content = 'Tu servicio no está activo.' + errMsg.content;
      }
      else errMsg.content = null;
      if (errMsg.content)
        res.render('response', errMsg);
      else {
        payment.request(req.body, function(err) {
          errMsg.title = err ? 'Lo sentimos' : 'Solicitud en proceso';
          errMsg.content = err ? err + errMsg.content : 'Tu solicitud ha sido aceptada.' +
            ' Muy pronto uno de nuestros profesionales se pondrá en contacto. Si tienes alguna inquietud:';
          res.render('response', errMsg);
        })
      }
    })
  });

  // Requerimiento de servicio enviado
  app.get('/service-serve', function(req, res, next) {
    var msg = {
      title: 'Atención comenzada',
      content: 'Se ha registrado el inicio de la atención a tu nombre, te recordamos los datos de contacto:',
      redirectTo: `/home?access_token=${req.query.accessToken}`,
      redirectToLinkText: 'Volver al inicio',
    }
    var errMsg = Object.assign({}, msg, { title: 'Error', content: 'Falló el registro de la atención:' })
    app.models.AccessToken.findById(req.query.accessToken, function(err, tok) {
      if (err || !tok) errMsg.content += err && res.render('response', errMsg);
      else {
        console.log('/service-serve', req.query);
        app.models.Prepaid.findById(req.query.payment, function(err, payment) {
          if (err || !payment) errMsg += err && res.render('response', errMsg);
          else payment.serve({ accessToken: tok }, function(err) {
            if (err){
              errMsg += err && res.render('response', errMsg);
              return 
            } 
            i18n = {
              'video':'Videollamada',
              'chat':'Chat',
              'call':'Llamada',          
            }
            msg.contact = Object.assign({}, payment.contactRequest);
            msg.contact.contactBy = i18n[msg.contact.contactBy]; 
            res.render('served', msg);
          })
        });
      }
    })
  })
};
