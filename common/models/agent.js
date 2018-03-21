// Copyright IBM Corp. 2014,2015. All Rights Reserved.
// Node module: loopback-example-user-management
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

var config = require('../../server/config.json');
var path = require('path');
var senderAddress = "noreply@loopback.com"; //FIXME Replace this address with your actual address

module.exports = function(Agent) {
  //send verification email after registration
  Agent.afterRemote('create', function(context, user, next) {
    var options = {
      type: 'email',
      to: user.email,
      from: senderAddress,
      subject: 'Gracias por registrarse.',
      template: path.resolve(__dirname, '../../server/views/verify.ejs'),
      redirect: '/verified',
      user: user
    };

    user.verify(options, function(err, response) {
      if (err) {
        Agent.deleteById(user.id);
        return next(err);
      }
      context.res.render('response', {
        title: 'Registro exitoso',
        content: 'Por favor revise su correo y de clic en el enlace de verificación' +
            'antes de ingresar al sistema.',
        redirectTo: '/',
        redirectToLinkText: 'Ingresar'
      });
    });
  });
  
  // Method to render
  Agent.afterRemote('prototype.verify', function(context, user, next) {
    context.res.render('response', {
      title: 'Un enlace para confirmar tu identidad ha sido exitosamente enviado a tu correo',
      content: 'Por favor verifica tu correo y dale clic en el enlace de verificación antes de ingresar al sistema',
      redirectTo: '/',
      redirectToLinkText: 'Log in'
    });
  });

  //send password reset link when requested
  Agent.on('resetPasswordRequest', function(info) {
    var url = 'http://' + config.host + ':' + config.port + '/reset-password';
    var html = 'Clic <a href="' + url + '?access_token=' +
        info.accessToken.id + '">aquí</a> para reiniciar su contraseña';

    Agent.app.models.Email.send({
      to: info.email,
      from: senderAddress,
      subject: 'Password reset',
      html: html
    }, function(err) {
      if (err) return console.log('> error sending password reset email');
      console.log('> sending password reset email to:', info.email);
    });
  });

  //render UI page after password change
  Agent.afterRemote('changePassword', function(context, user, next) {
    context.res.render('response', {
      title: 'Contraseña cambiada exitosamente',
      content: 'Por favor ingrese de nuevo con la nueva contraseña',
      redirectTo: '/',
      redirectToLinkText: 'Ingresar'
    });
  });

  //render UI page after password reset
  Agent.afterRemote('setPassword', function(context, user, next) {
    context.res.render('response', {
      title: 'Reinicio exitoso de contraseña',
      content: 'Tu contraseña se ha reiniciado correctamente',
      redirectTo: '/',
      redirectToLinkText: 'Ingresar'
    });
  });
};
