#!/bin/bash
LOG_FILE="/var/log/install-certbot.log"
{
    echo "Installing Certbot..."

    # Install Certbot
    sudo yum install -y certbot python3-certbot-nginx

    # Obtain SSL certificate
    sudo certbot certonly --nginx -d app.prerak.net --non-interactive --agree-tos -m preraku@gmail.com

    # Create symbolic links to the certificates
    sudo ln -sf /etc/letsencrypt/live/app.prerak.net/fullchain.pem /etc/pki/tls/certs/your-certificate.crt
    sudo ln -sf /etc/letsencrypt/live/app.prerak.net/privkey.pem /etc/pki/tls/private/your-private-key.key

    # Reload Nginx to apply the new certificates
    sudo service nginx reload
} &>> $LOG_FILE