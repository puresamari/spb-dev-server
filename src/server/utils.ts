import { IDevServerOptions } from './../definitions';
import http, { RequestListener, Server as HttpServer } from 'http';
import https, { Server as HttpsServer } from 'https';
import pem, { CertificateCreationResult } from 'pem';

export type WebServer = HttpServer | HttpsServer;

export async function GenerateWebServer(devServerOptions: IDevServerOptions, listener: RequestListener): Promise<WebServer> {

  if (devServerOptions.secure) {
    const keys = await new Promise<CertificateCreationResult>(resolve => {
      pem.createCertificate({ days: 1, selfSigned: true, }, function (err, keys) {
        if (err) {
          throw err
        };
        resolve(keys);
      })
    });
    return https.createServer({
      key: keys.serviceKey, cert: keys.certificate
    }, listener).listen(
      devServerOptions.port,
      devServerOptions.host,
      () => console.log('Secure webserver launched!')
    );
  }

  return http.createServer(listener)
    .listen(
      devServerOptions.port,
      devServerOptions.host,
      () => console.log('Webserver launched!')
    );
}