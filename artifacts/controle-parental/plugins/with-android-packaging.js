const { withAppBuildGradle } = require('expo/config-plugins');

const duplicateMetadata = 'META-INF/versions/9/OSGI-INF/MANIFEST.MF';
const debugSigningBlock = `    signingConfigs {\n        debug {\n            storeFile file('debug.keystore')\n            storePassword 'android'\n            keyAlias 'androiddebugkey'\n            keyPassword 'android'\n        }\n    }\n`;
const releaseBuildTypeStart = `        release {\n            // Caution! In production, you need to generate your own keystore file.\n            // see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.debug\n`;

module.exports = function withAndroidPackaging(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('O projeto Android do Ampara precisa usar Gradle Groovy.');
    }

    let source = config.modResults.contents;
    const packagingBlock = '    packagingOptions {\n';
    const excludeBlock = `        resources {\n            excludes += ["${duplicateMetadata}"]\n        }\n`;

    if (!source.includes(duplicateMetadata)) {
      if (!source.includes(packagingBlock)) {
        throw new Error('Não foi possível localizar packagingOptions em app/build.gradle.');
      }
      source = source.replace(packagingBlock, `${packagingBlock}${excludeBlock}`);
    }

    if (!source.includes('amparaReleaseSigningConfigured')) {
      const releaseSigningBlock = `    def amparaReleaseStoreFile = System.getenv('ANDROID_KEYSTORE_FILE') ?: findProperty('android.keystoreFile')\n    def amparaReleaseStorePassword = System.getenv('ANDROID_KEYSTORE_PASSWORD') ?: findProperty('android.keystorePassword')\n    def amparaReleaseKeyAlias = System.getenv('ANDROID_KEY_ALIAS') ?: findProperty('android.keyAlias')\n    def amparaReleaseKeyPassword = System.getenv('ANDROID_KEY_PASSWORD') ?: findProperty('android.keyPassword')\n    def amparaReleaseSigningConfigured = [amparaReleaseStoreFile, amparaReleaseStorePassword, amparaReleaseKeyAlias, amparaReleaseKeyPassword].every { it != null && !it.toString().trim().isEmpty() }\n\n`;

      if (!source.includes(debugSigningBlock)) {
        throw new Error('Não foi possível localizar a configuração de assinatura debug em app/build.gradle.');
      }
      if (!source.includes(releaseBuildTypeStart)) {
        throw new Error('Não foi possível localizar o build type release em app/build.gradle.');
      }

      source = source.replace(debugSigningBlock, `${releaseSigningBlock}    signingConfigs {\n        debug {\n            storeFile file('debug.keystore')\n            storePassword 'android'\n            keyAlias 'androiddebugkey'\n            keyPassword 'android'\n        }\n        if (amparaReleaseSigningConfigured) {\n            release {\n                storeFile file(amparaReleaseStoreFile)\n                storePassword amparaReleaseStorePassword\n                keyAlias amparaReleaseKeyAlias\n                keyPassword amparaReleaseKeyPassword\n            }\n        }\n    }\n`);
      source = source.replace(
        releaseBuildTypeStart,
        `        release {\n            if (amparaReleaseSigningConfigured) {\n                signingConfig signingConfigs.release\n            }\n`,
      );
      source += `\ngradle.taskGraph.whenReady { graph ->\n    def isAndroidReleaseArtifact = graph.allTasks.any { task ->\n        task.name ==~ /(?i)(assemble|bundle|package).*release.*/\n    }\n    if (isAndroidReleaseArtifact && !amparaReleaseSigningConfigured) {\n        throw new GradleException('Android release bloqueado: configure ANDROID_KEYSTORE_FILE, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS e ANDROID_KEY_PASSWORD antes de gerar APK/AAB.')\n    }\n}\n`;
    }

    config.modResults.contents = source;
    return config;
  });
};
