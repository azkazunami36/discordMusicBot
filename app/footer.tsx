"use client";

export default function footer() {
    return (
        <footer>
            <div className="leftFunc">
                <div className="volumeSetter">
                    <span className="material-symbols-outlined">volume_up</span>
                    <div className="seekBar">
                        <input type="range" />
                    </div>
                </div>
            </div>
            <div className="playMusicStatus">
                <div className="left">
                    <span className="material-symbols-outlined">fast_rewind</span>
                    <span className="material-symbols-outlined playButton">play_arrow</span>
                    <span className="material-symbols-outlined">fast_forward</span>
                    <div className="image">
                        <img />
                    </div>
                </div>
                <div className="center">
                    <div className="top">
                        <div className="title">テスト</div>
                        <div className="info">テスト</div>
                    </div>
                    <div className="bottom">
                        <div className="time nowTime">0:00</div>
                        <div className="seekBar">
                            <input type="range" className="seekBarInput" min="0" max="100" step="0.001" />
                        </div>
                        <div className="time maxTime">0:00</div>
                    </div>
                </div>
                <div className="right">
                    <span className="material-symbols-outlined repeatButton">repeat</span>
                    <span className="material-symbols-outlined">shuffle</span>
                    <span className="material-symbols-outlined">star</span>
                </div>
            </div>
            <div className="rightFunc">
                <span className="material-symbols-outlined">graphic_eq</span>
                <span className="material-symbols-outlined">surround_sound</span>
                <span className="material-symbols-outlined">library_music</span>
                <span className="material-symbols-outlined">lyrics</span>
            </div>
        </footer>
    );
}
