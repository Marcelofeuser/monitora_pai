const { withAppBuildGradle } = require('expo/config-plugins');

const duplicateMetadata = 'META-INF/versions/9/OSGI-INF/MANIFEST.MF';

module.exports = function withAndroidPackaging(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('O projeto Android do Ampara precisa usar Gradle Groovy.');
    }

    const source = config.modResults.contents;
    const packagingBlock = '    packagingOptions {\n';
    const excludeBlock = `        resources {\n            excludes += ["${duplicateMetadata}"]\n        }\n`;

    if (source.includes(duplicateMetadata)) {
      return config;
    }
    if (!source.includes(packagingBlock)) {
      throw new Error('Não foi possível localizar packagingOptions em app/build.gradle.');
    }

    config.modResults.contents = source.replace(
      packagingBlock,
      `${packagingBlock}${excludeBlock}`,
    );
    return config;
  });
};
