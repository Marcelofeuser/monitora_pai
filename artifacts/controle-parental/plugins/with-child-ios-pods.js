const { withPodfile } = require('expo/config-plugins');

module.exports = function withChildIosPods(config) {
  return withPodfile(config, (config) => {
    const marker = '    react_native_post_install(';
    // ClerkExpo precisa do ClerkKit (SPM) para compilar: o JS da criança também importa @clerk/expo.
    // Por isso NÃO removemos mais a dependência SPM do ClerkExpo aqui (causava "no such module 'ClerkKit'").
    const appConfigMarker = "config_phase.shell_script = \"AMPARA_APP=crianca #{config_phase.shell_script}\"";
    const appConfigBlock = `

    # Keep Expo Constants aligned with this child-only native project. Xcode
    # runs this phase without the shell environment used by Expo prebuild.
    installer.pods_project.targets.each do |target|
      next unless target.name == 'EXConstants'

      config_phase = target.build_phases.find do |phase|
        phase.respond_to?(:shell_script) && phase.shell_script.include?('get-app-config-ios.sh')
      end
      if config_phase && !config_phase.shell_script.start_with?('AMPARA_APP=crianca ')
        config_phase.shell_script = "AMPARA_APP=crianca #{config_phase.shell_script}"
      end
    end
`;

    const contents = config.modResults.contents;
    if (!contents.includes(marker)) {
      throw new Error('Não foi possível localizar react_native_post_install no Podfile.');
    }

    let updated = contents;
    if (!updated.includes(appConfigMarker)) {
      const closingPostInstall = '\n  end\nend';
      const insertionPoint = updated.lastIndexOf(closingPostInstall);
      if (insertionPoint === -1) {
        throw new Error('Não foi possível localizar o fim do bloco post_install no Podfile.');
      }
      updated = `${updated.slice(0, insertionPoint)}${appConfigBlock}${updated.slice(insertionPoint)}`;
    }

    config.modResults.contents = updated;
    return config;
  });
};
