const { withPodfile } = require('expo/config-plugins');

module.exports = function withChildIosPods(config) {
  return withPodfile(config, (config) => {
    const marker = '    react_native_post_install(';
    const cleanup =
      "    SPM.instance_variable_get(:@dependencies_by_pod).delete('ClerkExpo') if defined?(SPM)\n";

    if (config.modResults.contents.includes(cleanup.trim())) {
      return config;
    }
    if (!config.modResults.contents.includes(marker)) {
      throw new Error('Não foi possível localizar react_native_post_install no Podfile.');
    }

    config.modResults.contents = config.modResults.contents.replace(
      marker,
      `${cleanup}${marker}`,
    );
    return config;
  });
};
