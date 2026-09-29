"""Servidor de desarrollo por HTTPS.

Chrome solo deja usar el micrófono en páginas seguras (https o localhost). Para que la
tablet pueda escuchar el piano entrando por la IP del PC, servimos la app con un
certificado autofirmado que se genera la primera vez (y cuando cambia la IP).
"""
import socket
import ssl
import subprocess
from pathlib import Path

from django.conf import settings
from django.contrib.staticfiles.handlers import StaticFilesHandler
from django.core.management.base import BaseCommand, CommandError
from django.core.servers.basehttp import ThreadedWSGIServer, WSGIRequestHandler
from django.core.wsgi import get_wsgi_application


def lan_ip():
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(('10.255.255.255', 1))
            return s.getsockname()[0]
        except OSError:
            return '127.0.0.1'


class Command(BaseCommand):
    help = 'Sirve la app por HTTPS en la red local (necesario para el micrófono de la tablet).'

    def add_arguments(self, parser):
        parser.add_argument('addrport', nargs='?', default='0.0.0.0:8443')
        parser.add_argument('--certdir', default=str(settings.BASE_DIR / '.certs'))

    def handle(self, addrport, certdir, **opts):
        host, _, port = addrport.rpartition(':')
        host = host or '0.0.0.0'
        if not port.isdigit():
            raise CommandError(f'Puerto inválido: {addrport}')
        ip = lan_ip()
        cert, key = self.ensure_cert(Path(certdir), ip)

        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert, key)
        app = get_wsgi_application()
        if settings.DEBUG:
            app = StaticFilesHandler(app)

        httpd = ThreadedWSGIServer((host, int(port)), WSGIRequestHandler)
        httpd.daemon_threads = True
        # Sin handshake en accept(): cada hilo lo hace al leer, así un cliente lento no bloquea al resto.
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True, do_handshake_on_connect=False)
        httpd.set_app(app)

        self.stdout.write(self.style.SUCCESS(f'Abre en la tablet: https://{ip}:{port}/'))
        self.stdout.write('El certificado es autofirmado: en Chrome toca «Configuración avanzada» → «Continuar».')
        self.stdout.write('Ctrl+C para detener.')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            httpd.server_close()

    def ensure_cert(self, certdir, ip):
        certdir.mkdir(parents=True, exist_ok=True)
        cert, key, stamp = certdir / 'cert.pem', certdir / 'key.pem', certdir / 'ip.txt'
        if cert.exists() and key.exists() and stamp.exists() and stamp.read_text().strip() == ip:
            return cert, key
        self.stdout.write(f'Generando certificado autofirmado para {ip}…')
        try:
            subprocess.run([
                'openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '825',
                '-keyout', str(key), '-out', str(cert), '-subj', '/CN=piano-piano',
                '-addext', f'subjectAltName=IP:{ip},IP:127.0.0.1,DNS:localhost',
            ], check=True, capture_output=True)
        except FileNotFoundError:
            raise CommandError('No se encontró openssl para generar el certificado.')
        except subprocess.CalledProcessError as e:
            raise CommandError(e.stderr.decode(errors='replace'))
        stamp.write_text(ip)
        return cert, key
