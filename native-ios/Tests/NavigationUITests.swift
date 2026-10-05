import XCTest

final class NavigationUITests: XCTestCase {
    func testIosUploadConversionAndTransport() {
        let app = XCUIApplication()
        app.launchArguments = ["--ios-upload-fixtures"]
        app.launch()
        let finished = app.webViews.firstMatch.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "iOS上传回归")).firstMatch
        let completed = finished.waitForExistence(timeout: 120)
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "iOS local WebP encoding and note/gallery upload regression"; shot.lifetime = .keepAlways; add(shot)
        let diagnostic = XCTAttachment(string: app.debugDescription)
        diagnostic.name = "Upload regression accessibility report"; diagnostic.lifetime = .keepAlways; add(diagnostic)
        XCTAssertTrue(completed && finished.label == "iOS上传回归通过", "Actual WKWebView HTTPS/WebP/upload failure:\n" + app.debugDescription)
    }
    func testFeedbackEntryAndTemplate() {
        let app = XCUIApplication(); app.launchArguments = ["--ios-ui-fixtures"]; app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 30)); tabs.buttons["我的"].tap()
        let about = app.webViews.firstMatch.buttons["关于应用"]
        XCTAssertTrue(about.waitForExistence(timeout: 15))
        for _ in 0..<5 { if about.isHittable { break }; app.webViews.firstMatch.swipeUp() }
        XCTAssertTrue(about.isHittable); about.tap()
        let feedback = app.webViews.firstMatch.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "问题反馈")).firstMatch
        XCTAssertTrue(feedback.waitForExistence(timeout: 15)); feedback.tap()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "1067807011")).firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(web.buttons["复制反馈信息"].exists)
        XCTAssertTrue(web.links["在 GitHub 提交问题 ↗"].exists)
        let field = web.textViews.firstMatch
        XCTAssertTrue(field.exists); XCTAssertTrue((field.value as? String ?? "").contains("1.1.14"))
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "iPhone in-app feedback entry and local diagnostic template"; shot.lifetime = .keepAlways; add(shot)
    }
    func testIPadLandscapeContentFitsScreen() {
        XCUIDevice.shared.orientation = .landscapeLeft
        defer { XCUIDevice.shared.orientation = .portrait }
        let app = XCUIApplication()
        app.launchArguments = ["--ios-ui-fixtures"]
        app.launch()
        let web = app.webViews.firstMatch
        let first = web.staticTexts["测试文章 1"]
        XCTAssertTrue(first.waitForExistence(timeout: 20))
        XCTAssertGreaterThan(app.frame.width, app.frame.height, "The simulator must really be in landscape")
        XCTAssertGreaterThan(web.frame.width, app.frame.width * 0.98, "WKWebView must fill the horizontal window")
        XCTAssertGreaterThan(web.frame.height, app.frame.height * 0.85, "No empty lower fifth of the screen")
        XCTAssertLessThanOrEqual(web.frame.maxX, app.frame.maxX + 1)
        XCTAssertLessThanOrEqual(web.frame.maxY, app.frame.maxY + 1)
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.exists)
        XCTAssertGreaterThan(tabs.frame.maxY, app.frame.maxY - 50)
        for label in ["资源", "测评", "问答", "我的"] { XCTAssertTrue(tabs.buttons[label].isHittable) }
        let second = web.staticTexts["测试文章 2"]
        XCTAssertTrue(first.isHittable)
        XCTAssertTrue(second.isHittable)
        XCTAssertLessThan(second.frame.maxY, tabs.frame.minY, "Column rows must remain above the dock")
        XCTAssertTrue(web.staticTexts["测试专栏"].isHittable, "The column sidebar must be visible")
        func capture(_ name: String) {
            // Capture the display rather than cropping UIApplication's frame in
            // portrait coordinates while the simulator is rotated.
            let screenshot = XCUIScreen.main.screenshot()
            XCTAssertGreaterThan(screenshot.image.size.width, screenshot.image.size.height)
            let shot = XCTAttachment(screenshot: screenshot)
            shot.name = name; shot.lifetime = .keepAlways; add(shot)
        }
        capture("iPad-landscape-column-light")
        first.tap()
        XCTAssertTrue(web.staticTexts["图片原生加载通过"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.buttons["native-back"].isHittable)
        capture("iPad-landscape-article-light")
        app.buttons["native-back"].tap()
        XCTAssertTrue(first.waitForExistence(timeout: 10))
        tabs.buttons["我的"].tap()
        XCTAssertTrue(web.buttons["账号与登录"].waitForExistence(timeout: 5))
        capture("iPad-landscape-my-light")
        let dark = web.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "深色")).firstMatch
        XCTAssertTrue(dark.isHittable)
        // WebKit exposes aria-pressed buttons as switches. Use an actual touch
        // at the button centre, and wait for its DOM-selected accessibility value.
        dark.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        let selected = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", "1"), object: dark)
        XCTAssertEqual(XCTWaiter.wait(for: [selected], timeout: 10), .completed, "Dark mode must actually become selected before capture")
        capture("iPad-landscape-my-dark")
    }
    func testBoardReplyFitsPhoneAndSupportsEditing() {
        let app = XCUIApplication()
        app.launchArguments = ["--ios-ui-fixtures", "--ios-board-fixtures"]
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.buttons["画笔"].waitForExistence(timeout: 20))
        let zoom = web.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "[0-9]+%" )).firstMatch
        XCTAssertTrue(zoom.exists, "Zoom must be positive, never -1%")
        let numericZoom = Int(zoom.label.replacingOccurrences(of: "%", with: "")) ?? 0
        XCTAssertGreaterThan(numericZoom, 0)
        XCTAssertLessThanOrEqual(numericZoom, 100)
        web.buttons["文字"].tap()
        let text = web.textViews.firstMatch
        XCTAssertTrue(text.waitForExistence(timeout: 5), "Fabric editing must open on real WKWebView")
        text.typeText("iOS board")
        web.buttons["选择"].tap()
        web.buttons["撤销"].tap()
        web.buttons["重做"].tap()
        XCTAssertTrue(web.buttons["发送"].exists)
        XCTAssertTrue(app.buttons["native-back"].exists)
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "Board reply positive zoom and visible canvas"; shot.lifetime = .keepAlways; add(shot)
    }
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
