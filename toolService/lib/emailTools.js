'use strict';

const toolRegistry = require('./toolRegistry');

function registerAll() {
    toolRegistry.register({
        name: 'email_send',
        description: 'Send an email via SMTP.',
        parameters: {
            type: 'object',
            properties: {
                smtpServer: { type: 'string', description: 'SMTP host' },
                smtpPort: { type: 'number', description: 'SMTP port' },
                sendMailAccount: { type: 'string', description: 'Sender email address' },
                sendMailPassword: { type: 'string', description: 'Sender password / app password' },
                receiveMailAccount: { type: 'string', description: 'Recipient email address' },
                subject: { type: 'string', description: 'Email subject (default: "Test email")' },
                text: { type: 'string', description: 'Email body text (default: "This is a test email.")' }
            },
            required: ['smtpServer', 'smtpPort', 'sendMailAccount', 'sendMailPassword', 'receiveMailAccount']
        },
        category: 'email',
        handler: async (params) => {
            const nodemailer = require('nodemailer');
            const { smtpServer, smtpPort, sendMailAccount, sendMailPassword, receiveMailAccount, subject, text } = params;

            const transporter = nodemailer.createTransport({
                host: smtpServer,
                port: smtpPort,
                auth: {
                    user: sendMailAccount,
                    pass: sendMailPassword
                }
            });

            const mailOptions = {
                from: sendMailAccount,
                to: receiveMailAccount,
                subject: subject || 'Test email',
                text: text || 'This is a test email.'
            };

            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Email send timeout')), 10000));
            await Promise.race([timeout, transporter.sendMail(mailOptions)]);

            return { sent: true, to: receiveMailAccount };
        }
    });

    console.log('[emailTools] Registered 1 email tool');
}

module.exports = { registerAll };
