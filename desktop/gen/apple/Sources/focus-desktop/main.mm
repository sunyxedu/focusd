#import <UIKit/UIKit.h>
#include "bindings/bindings.h"

// iOS 26+/27 SDKs require UIScene lifecycle adoption. The Tauri runtime
// still creates a classic UIWindow, so we track every window that becomes
// visible and attach it to the app's single window scene.
static NSMutableArray<UIWindow *> *gWindows;
static UIWindowScene *gScene;

static void attachWindows(void) {
    if (gScene == nil) return;
    for (UIWindow *w in [gWindows copy]) {
        if (w.windowScene != gScene) {
            w.windowScene = gScene;
            w.frame = gScene.coordinateSpace.bounds;
            [w makeKeyAndVisible];
        }
    }
}

@interface FocusSceneDelegate : UIResponder <UIWindowSceneDelegate>
@property (nonatomic, strong) UIWindow *window;
@end

@implementation FocusSceneDelegate
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)connectionOptions {
    if ([scene isKindOfClass:[UIWindowScene class]]) {
        gScene = (UIWindowScene *)scene;
    }
    attachWindows();
}
- (void)sceneDidBecomeActive:(UIScene *)scene {
    attachWindows();
}
@end

int main(int argc, char * argv[]) {
    gWindows = [NSMutableArray new];
    [[NSNotificationCenter defaultCenter] addObserverForName:UIWindowDidBecomeVisibleNotification object:nil queue:[NSOperationQueue mainQueue] usingBlock:^(NSNotification *note) {
        UIWindow *w = (UIWindow *)note.object;
        if (w && ![gWindows containsObject:w]) {
            [gWindows addObject:w];
        }
        attachWindows();
    }];
    ffi::start_app();
    return 0;
}
