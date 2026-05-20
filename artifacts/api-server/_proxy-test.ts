import { getProxyAgent, validateProxyUrl, redactProxyUrl } from './src/lib/proxy-agent.ts';
console.log('valid http   :', validateProxyUrl('http://user:pw@1.2.3.4:8080') ?? 'OK');
console.log('valid socks5 :', validateProxyUrl('socks5://u:p@gate.smartproxy.com:7000') ?? 'OK');
console.log('reject ftp   :', validateProxyUrl('ftp://x:1'));
console.log('reject empty :', validateProxyUrl(''));
console.log('redact       :', redactProxyUrl('socks5://user:supersecret@gate.example.com:7000'));
console.log('agent http   :', getProxyAgent('http://1.2.3.4:8080').constructor.name);
console.log('agent socks5 :', getProxyAgent('socks5://1.2.3.4:1080').constructor.name);
