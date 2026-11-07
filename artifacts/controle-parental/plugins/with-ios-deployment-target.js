const { withPodfile } = require('expo/config-plugins');

const DEPLOYMENT_TARGET = '15.1';

module.exports = function withIosDeploymentTarget(config) {
  return withPodfile(config, (config) => {
    const marker = '    react_native_post_install(';
    const snippet =
      "    installer.pods_project.targets.each do |target|\n" +
      "      target.build_configurations.each do |build_configuration|\n" +
      `        build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${DEPLOYMENT_TARGET}'\n` +
      "      end\n" +
      "    end\n";

    if (config.modResults.contents.includes(`IPHONEOS_DEPLOYMENT_TARGET'] = '${DEPLOYMENT_TARGET}'`)) {
      return config;
    }
    if (!config.modResults.contents.includes(marker)) {
      throw new Error('Não foi possível localizar react_native_post_install no Podfile.');
    }

    config.modResults.contents = config.modResults.contents.replace(
      marker,
      `${snippet}${marker}`,
    );
    return config;
  });
};
