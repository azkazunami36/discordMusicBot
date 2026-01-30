import "./scss/html_body.scss";
import "./style.scss";
import Head from "./head.tsx";
import Header from "./header.tsx";
import Sidebar from "./sidebar.tsx";
import Footer from "./footer.tsx";
import Popup from "./popup.tsx";

export const metadata = {
    title: "My App",
    description: "が",
};

export default function RootLayout(
    { children }: { children: React.ReactNode; }
) {
    return (
        <html lang="ja">
            <head><Head /></head>
            <body>
                <Header />
                        <main>
                            <Sidebar />
                            <section id="main">{children}</section>
                        </main>
                <Footer />
                <Popup />
            </body>
        </html>
    );
}
