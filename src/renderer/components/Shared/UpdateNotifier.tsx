// src/components/Shared/UpdateNotifier.tsx
import React, { useState } from "react";
import { Download, RefreshCw, X, AlertCircle } from "lucide-react";
import { useUpdater } from "../../hooks/useUpdater";
import Button from "../UI/Button";

const UpdateNotifier: React.FC = () => {
  const { state, updateInfo, progress, error, downloadUpdate, installUpdate } =
    useUpdater();
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleDownload = async () => {
    setIsLoading(true);
    try {
      await downloadUpdate();
    } finally {
      setIsLoading(false);
    }
  };

  if (
    state !== "available" &&
    state !== "downloading" &&
    state !== "downloaded"
  ) {
    return null;
  }

  const getIcon = () => {
    switch (state) {
      case "downloading":
        return <RefreshCw className="icon-sm animate-spin" />;
      default:
        return <Download className="icon-sm" />;
    }
  };

  const getBadge = () => {
    if (state === "available") {
      return (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">
          !
        </span>
      );
    }
    return null;
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="relative p-2 rounded-lg hover:bg-[var(--card-secondary-bg)] text-[var(--sidebar-text)] transition-colors duration-200"
        aria-label="Update available"
      >
        {getIcon()}
        {getBadge()}
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card-bg)] rounded-xl shadow-xl max-w-md w-full p-6 relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg hover:bg-[var(--card-secondary-bg)]"
            >
              <X className="icon-sm" />
            </button>

            <h2 className="text-xl font-bold mb-4 text-[var(--sidebar-text)]">
              Update Available
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg flex items-center gap-2">
                <AlertCircle className="icon-sm" />
                <span>{error}</span>
              </div>
            )}

            {updateInfo && (
              <div className="mb-4">
                <p className="text-sm text-[var(--text-secondary)]">
                  Version {updateInfo.version}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Released:{" "}
                  {new Date(updateInfo.releaseDate).toLocaleDateString()}
                </p>
                {updateInfo.releaseNotes && (
                  <div className="mt-2 p-3 bg-[var(--card-secondary-bg)] rounded-lg max-h-40 overflow-y-auto">
                    <p className="text-sm font-medium mb-1">What's new:</p>
                    <pre className="text-xs whitespace-pre-wrap">
                      {updateInfo.releaseNotes}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {progress && state === "downloading" && (
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span>Downloading...</span>
                  <span>{Math.round(progress.percent)}%</span>
                </div>
                <div className="w-full h-2 bg-[var(--border-color)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--primary-color)] transition-all duration-300"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              {state === "available" && (
                <Button
                  onClick={async () => {
                    setIsLoading(true);
                    try {
                      await downloadUpdate();
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  disabled={isLoading}
                  className="btn-primary btn-sm px-4 py-2 flex items-center gap-2 
               hover:bg-[var(--primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="icon-sm animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    "Download Update"
                  )}
                </Button>
              )}
              {state === "downloaded" && (
                <Button
                  onClick={() => {
                    installUpdate();
                  }}
                  className="btn-success btn-sm px-4 py-2"
                >
                  Install & Restart
                </Button>
              )}
              <Button
                onClick={() => setShowModal(false)}
                className="btn-secondary btn-sm px-4 py-2"
              >
                Later
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UpdateNotifier;
