const fs = require('node:fs/promises');
const path = require('node:path');
const {
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins');

const sceneDelegate = `import Expo
import React
import UIKit

@objc(SceneDelegate)
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate else {
      return
    }

    appDelegate.startReactNative(in: windowScene)

    for context in connectionOptions.urlContexts {
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: [:])
    }

    if let userActivity = connectionOptions.userActivities.first {
      _ = appDelegate.application(
        UIApplication.shared,
        continue: userActivity,
        restorationHandler: { _ in }
      )
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { continue }
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in }
    )
  }
}
`;

function withSceneManifest(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return mod;
  });
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') {
      throw new Error('O ciclo de cenas do Ampara exige um AppDelegate Swift.');
    }

    let contents = mod.modResults.contents;
    const legacyStartup = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif`;
    contents = contents.replace(legacyStartup, '');

    if (!contents.includes('startReactNative(in windowScene: UIWindowScene)')) {
      const insertionMarker = '  // Linking API';
      if (!contents.includes(insertionMarker)) {
        throw new Error('Não foi possível localizar o ponto de extensão no AppDelegate.swift.');
      }
      contents = contents.replace(
        insertionMarker,
        `  public func startReactNative(in windowScene: UIWindowScene) {
    guard let factory = reactNativeFactory else {
      fatalError("React Native factory não foi inicializada antes da cena.")
    }

    window = UIWindow(windowScene: windowScene)
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: nil)
  }

  public func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(
      name: "Default Configuration",
      sessionRole: connectingSceneSession.role
    )
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }

${insertionMarker}`,
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });
}

function withSceneDelegateFile(config) {
  return withDangerousMod(config, [
    'ios',
    async (mod) => {
      const filePath = path.join(mod.modRequest.platformProjectRoot, 'AmparaCriana', 'SceneDelegate.swift');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, sceneDelegate);
      return mod;
    },
  ]);
}

function withSceneDelegateTarget(config) {
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    if (!project.hasFile('AmparaCriana/SceneDelegate.swift')) {
      const target = project.getFirstTarget();
      const groups = project.hash.project.objects.PBXGroup;
      const appGroup = Object.entries(groups).find(([, group]) =>
        group.children?.some((child) => child.comment === 'AppDelegate.swift'),
      );
      if (!appGroup) {
        throw new Error('Não foi possível localizar o grupo do AppDelegate no projeto Xcode.');
      }
      project.addSourceFile(
        'AmparaCriana/SceneDelegate.swift',
        { target: target.uuid },
        appGroup[0],
      );
    }
    return mod;
  });
}

module.exports = function withIosSceneLifecycle(config) {
  config = withSceneManifest(config);
  config = withSceneAppDelegate(config);
  config = withSceneDelegateFile(config);
  config = withSceneDelegateTarget(config);
  return config;
};
