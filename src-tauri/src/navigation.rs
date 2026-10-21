use tauri::{plugin::TauriPlugin, Manager, Runtime, Url};

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("navigation-guard")
        .on_navigation(|webview, url| {
            let dev_url = if cfg!(debug_assertions) {
                webview.app_handle().config().build.dev_url.as_ref()
            } else {
                None
            };
            is_app_url(url, dev_url)
        })
        .build()
}

fn is_app_url(url: &Url, dev_url: Option<&Url>) -> bool {
    if !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    let bundled = url.port().is_none()
        && match url.scheme() {
            "tauri" => url.host_str() == Some("localhost"),
            "http" | "https" => url.host_str() == Some("tauri.localhost"),
            _ => false,
        };
    bundled || dev_url.is_some_and(|dev| url.origin() == dev.origin())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn navigation_stays_on_the_application_origin() {
        for url in [
            "tauri://localhost/#intro",
            "http://tauri.localhost/",
            "https://tauri.localhost/",
        ] {
            assert!(is_app_url(&Url::parse(url).unwrap(), None), "{url}");
        }
        for url in [
            "https://example.com/",
            "https://tauri.localhost.evil.test/",
            "http://tauri.localhost:9000/",
            "file:///C:/private.txt",
            "data:text/html,test",
            "javascript:alert(1)",
            "http://127.0.0.1:1420/",
        ] {
            assert!(!is_app_url(&Url::parse(url).unwrap(), None), "{url}");
        }
        let dev = Url::parse("http://127.0.0.1:1420").unwrap();
        assert!(is_app_url(&dev.join("/#intro").unwrap(), Some(&dev)));
        assert!(!is_app_url(
            &Url::parse("http://127.0.0.1:1421/").unwrap(),
            Some(&dev),
        ));
    }
}
