export const metadata = {
    title: "My App",
    description: "テスト",
};

export default function RootLayout(
    { children }: { children: React.ReactNode; }
) {
    return (
        <html lang="ja">
            <body>{children}</body>
        </html>
    );
}
