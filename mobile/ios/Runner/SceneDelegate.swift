import Flutter
import UIKit

class SceneDelegate: FlutterSceneDelegate {
  // Contenu masqué dans le sélecteur d'applications (NF-SEC-05) : une vue opaque
  // recouvre la fenêtre dès que la scène perd le premier plan, avant l'instantané système.
  private var privacyCover: UIView?
  private var observers: [NSObjectProtocol] = []

  override init() {
    super.init()
    let center = NotificationCenter.default
    observers.append(
      center.addObserver(
        forName: UIScene.willDeactivateNotification, object: nil, queue: .main
      ) { [weak self] note in self?.onScene(note) { $0.showPrivacyCover() } })
    observers.append(
      center.addObserver(
        forName: UIScene.didActivateNotification, object: nil, queue: .main
      ) { [weak self] note in self?.onScene(note) { $0.hidePrivacyCover() } })
  }

  deinit {
    for observer in observers {
      NotificationCenter.default.removeObserver(observer)
    }
  }

  /// Ne réagit qu'aux notifications de la scène de cette fenêtre.
  private func onScene(_ note: Notification, _ action: (SceneDelegate) -> Void) {
    guard let scene = note.object as? UIScene, scene === window?.windowScene else { return }
    action(self)
  }

  private func showPrivacyCover() {
    guard privacyCover == nil, let window = window else { return }
    let cover = UIView(frame: window.bounds)
    cover.backgroundColor = .systemBackground
    cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    window.addSubview(cover)
    privacyCover = cover
  }

  private func hidePrivacyCover() {
    privacyCover?.removeFromSuperview()
    privacyCover = nil
  }
}
