import XCTest

final class NavigationUITests: XCTestCase {
    func testNativeGroupsAndSystemGlass() {
        let app = XCUIApplication()
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 20))
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
        XCTAssertEqual(app.navigationBars.count, 0, "No native navigation bar may divide the web UI")
        XCTAssertFalse(web.buttons["资源"].exists, "The web canvas must not draw a second tab bar")
        XCTAssertGreaterThan(web.frame.height, app.frame.height * 0.8)
        let tabs = app.tabBars.firstMatch
        XCTAssertGreaterThan(tabs.frame.maxY, app.frame.maxY - 50, "System tabs must sit near the home indicator")
        for label in ["资源", "测评", "问答", "我的"] {
            XCTAssertTrue(tabs.buttons[label].exists)
        }
        web.buttons["专栏"].tap()
        XCTAssertTrue(web.staticTexts["在线专栏"].exists)
        web.buttons["课程"].tap()
        XCTAssertTrue(web.buttons["进入学校选课"].exists)
        tabs.buttons["测评"].tap()
        XCTAssertTrue(web.buttons["作业"].exists)
        web.buttons["错题本"].tap()
        XCTAssertTrue(web.staticTexts["官方错题本"].exists)
        tabs.buttons["问答"].tap()
        XCTAssertTrue(web.staticTexts["随身答"].exists)
        tabs.buttons["资源"].tap()
        XCTAssertTrue(web.buttons["进入学校选课"].exists, "Remember the resource category across tab switches")
        let left = tabs.buttons["资源"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        let right = tabs.buttons["我的"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        left.press(forDuration: 0.1, thenDragTo: right)
        XCTAssertTrue(web.buttons["账号与登录"].waitForExistence(timeout: 5), "Sliding to My must show the account hub")
        // WebKit exposes aria-pressed controls as toggle elements, not regular buttons.
        let dark = web.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "深色")).firstMatch
        let system = web.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "跟随系统")).firstMatch
        XCTAssertTrue(dark.waitForExistence(timeout: 5))
        dark.tap()
        XCTAssertTrue(system.waitForExistence(timeout: 5))
        system.tap()
        right.press(forDuration: 0.1, thenDragTo: left)
        XCTAssertTrue(web.buttons["进入学校选课"].exists)
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "Native Apple Liquid Glass tabs with shared WKWebView"; shot.lifetime = .keepAlways
        add(shot)
    }
    func testColumnLayoutImagesAndNativeBack() {
        let app = XCUIApplication()
        app.launchArguments = ["--ios-ui-fixtures"]
        app.launch()
        let web = app.webViews.firstMatch
        let first = web.staticTexts["测试文章 1"]
        XCTAssertTrue(first.waitForExistence(timeout: 20))
        XCTAssertTrue(first.isHittable, "The article list must not be clipped below its search fields")
        let second = web.staticTexts["测试文章 2"]
        XCTAssertTrue(second.exists)
        XCTAssertLessThan(second.frame.maxY, app.tabBars.firstMatch.frame.minY)
        first.tap()
        XCTAssertTrue(web.staticTexts["图片原生加载通过"].waitForExistence(timeout: 20), "Real WKWebView image decoding through URLSession, without Origin/Referer")
        let back = app.buttons["native-back"]
        XCTAssertTrue(back.exists)
        back.tap()
        XCTAssertTrue(web.staticTexts["测试文章 1"].waitForExistence(timeout: 10))
        XCTAssertTrue(web.staticTexts["测试文章 2"].exists, "Native back restores the actual column list")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "Column list visible above native tab bar"; shot.lifetime = .keepAlways; add(shot)
    }
}
