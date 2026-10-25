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
    return name !== 'expo-camera'
      && name !== '@clerk/expo'
      && name !== 'expo-location'
      && name !== 'expo-secure-store';
  });
  if (variant.role === 'parent') {
    plugins.push('@clerk/expo');
  } else {
    plugins.push([
      'expo-location',
      {
        locationWhenInUsePermission: 'Permita que o Ampara compartilhe sua localização atual com seu responsável quando você tocar em Compartilhar localização.',
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
      },
    ]);
  }
  plugins.push('expo-secure-store');
  plugins.push([
    'expo-audio',
    {
      microphonePermission: 'Permita que o Ampara grave mensagens de voz durante uma conversa.',
      recordAudioAndroid: true,
      enableBackgroundPlayback: false,
      enableBackgroundRecording: false,
    },
  ]);
  plugins.push([
    '@config-plugins/react-native-webrtc',
    {
      cameraPermission: 'O Ampara usa a câmera durante chamadas iniciadas por você ou pelo seu responsável.',
      microphonePermission: 'O Ampara usa o microfone durante chamadas iniciadas por você ou pelo seu responsável.',
    },
  ]);
  plugins.push([
    'expo-image-picker',
    {
      photosPermission: 'Permita escolher uma foto para enviar na conversa privada do Ampara.',
      cameraPermission: 'O Ampara usa a câmera durante chamadas iniciadas por você ou pelo seu responsável.',
      microphonePermission: 'O Ampara usa o microfone durante chamadas iniciadas por você ou pelo seu responsável.',
    },
  ]);
  plugins.push('./plugins/with-android-packaging');
  plugins.push('./plugins/with-ios-deployment-target');
  if (variant.role === 'child') {
    plugins.push('./plugins/with-child-ios-pods');
  }

  return {
    ...config,
    name: variant.name,
    slug: variant.slug,
    scheme: variant.scheme,
    icon: variant.icon,
    splash: { ...config.splash, image: variant.icon },
    android: {
      ...config.android,
      package: variant.package,
      blockedPermissions: [
        ...(config.android?.blockedPermissions ?? []),
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
        ...(variant.role === 'parent'
          ? ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION']
          : []),
      ],
    },
    ios: {
      ...config.ios,
      bundleIdentifier: variant.package,
      deploymentTarget: '15.1',
    },
    web: { ...config.web, favicon: variant.icon },
    plugins,
    extra: { ...config.extra, appRole: variant.role },
  };
};
