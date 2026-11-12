const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('expo/config-plugins');

const FACTORY_MARKER = 'rejected by app-wide factory';

const FACTORY_REGISTRATION = [
  '    OkHttpClientProvider.setOkHttpClientFactory {',
  '      OkHttpClientProvider.createClientBuilder()',
  `        .addInterceptor { throw java.io.IOException("${FACTORY_MARKER}") }`,
  '        .build()',
  '    }',
  '',
].join('\n');

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">10.0.2.2</domain>
    <domain includeSubdomains="false">localhost</domain>
    <domain includeSubdomains="false">127.0.0.1</domain>
  </domain-config>
</network-security-config>
`;

function addFactoryToMainApplication(contents) {
  if (contents.includes(FACTORY_MARKER)) {
    return contents;
  }
  const applicationImport = 'import android.app.Application\n';
  const superOnCreate = '    super.onCreate()\n';
  if (!contents.includes(applicationImport) || !contents.includes(superOnCreate)) {
    throw new Error(
      'withRejectingOkHttpFactory: MainApplication does not match the SDK 58 template',
    );
  }
  return contents
    .replace(
      applicationImport,
      `${applicationImport}import com.facebook.react.modules.network.OkHttpClientProvider\n`,
    )
    .replace(superOnCreate, superOnCreate + FACTORY_REGISTRATION);
}

const withRejectingFactory = (config) =>
  withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      throw new Error('withRejectingOkHttpFactory: expected a Kotlin MainApplication');
    }
    mod.modResults.contents = addFactoryToMainApplication(mod.modResults.contents);
    return mod;
  });

const withLocalCleartext = (config) => {
  const withXml = withDangerousMod(config, [
    'android',
    async (mod) => {
      const xmlDir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      await fs.promises.mkdir(xmlDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(xmlDir, 'network_security_config.xml'),
        NETWORK_SECURITY_CONFIG,
      );
      return mod;
    },
  ]);
  return withAndroidManifest(withXml, (mod) => {
    const application = mod.modResults.manifest.application[0];
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return mod;
  });
};

module.exports = (config) => withLocalCleartext(withRejectingFactory(config));
