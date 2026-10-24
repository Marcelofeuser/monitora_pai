const variants = {
  responsavel: {
    name: 'Ampara Responsáveis',
    slug: 'ampara-responsavel',
    scheme: 'ampararesponsavel',
    package: 'com.amparakids.responsavel',
    role: 'parent',
    icon: './assets/images/icon.png',
  },
  crianca: {
    name: 'Ampara Criança',
    slug: 'ampara-crianca',
    scheme: 'amparacrianca',
    package: 'com.amparakids.crianca',
    role: 'child',
    icon: './assets/images/icon-child.png',
  },
};

module.exports = ({ config }) => {
  const variantName = process.env.AMPARA_APP ?? 'responsavel';
  const variant = variants[variantName];

  if (!variant) {
    throw new Error(
      `AMPARA_APP inválido: ${variantName}. Use "responsavel" ou "crianca".`,
    );
  }

  const plugins = (config.plugins ?? []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== 'expo-camera' && name !== '@clerk/expo' && name !== 'expo-secure-store';
  });
  if (variant.role === 'child') {
    plugins.push([
      'expo-camera',
      {
        cameraPermission: 'Permita que o Ampara leia o QR de pareamento.',
        recordAudioAndroid: false,
      },
    ]);
  } else {
    plugins.push('@clerk/expo');
  }
  plugins.push('expo-secure-store');
  plugins.push('./plugins/with-android-packaging');

  return {
    ...config,
    name: variant.name,
    slug: variant.slug,
    scheme: variant.scheme,
    icon: variant.icon,
    splash: { ...config.splash, image: variant.icon },
    android: { ...config.android, package: variant.package },
    ios: { ...config.ios, bundleIdentifier: variant.package },
    web: { ...config.web, favicon: variant.icon },
    plugins,
    extra: { ...config.extra, appRole: variant.role },
  };
};
