const fs = require('node:fs/promises');
const path = require('node:path');
const { withFinalizedMod } = require('expo/config-plugins');

module.exports = function withIosDeploymentTarget(config) {
  const deploymentTarget = config.ios?.deploymentTarget ?? '15.1';

  return withFinalizedMod(config, [
    'ios',
    async (modConfig) => {
      const iosDirectory = path.join(modConfig.modRequest.platformProjectRoot);
      const propertiesPath = path.join(iosDirectory, 'Podfile.properties.json');
      const properties = JSON.parse(await fs.readFile(propertiesPath, 'utf8'));
      properties['ios.deploymentTarget'] = deploymentTarget;
      await fs.writeFile(propertiesPath, `${JSON.stringify(properties, null, 2)}\n`);

      const projects = (await fs.readdir(iosDirectory, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && entry.name.endsWith('.xcodeproj'));
      if (projects.length !== 1) {
        throw new Error(`Esperado um projeto Xcode em ${iosDirectory}; encontrados ${projects.length}.`);
      }
      const projectPath = path.join(iosDirectory, projects[0].name, 'project.pbxproj');
      const project = await fs.readFile(projectPath, 'utf8');
      const updatedProject = project.replace(
        /IPHONEOS_DEPLOYMENT_TARGET = [^;]+;/g,
        `IPHONEOS_DEPLOYMENT_TARGET = ${deploymentTarget};`,
      );
      await fs.writeFile(projectPath, updatedProject);
      return modConfig;
    },
  ]);
};
