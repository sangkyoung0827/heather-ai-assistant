"use strict";

const { app, dialog } = require("electron");

function conflictHandler(conflictType) {
  if (conflictType === "existsAndRunning") {
    dialog.showMessageBoxSync({
      type: "warning",
      buttons: ["확인"],
      message: "응용 프로그램 폴더의 Heather가 실행 중입니다.",
      detail: "기존 Heather를 종료한 뒤 다시 설치하세요."
    });
    return false;
  }

  if (conflictType === "exists") {
    return dialog.showMessageBoxSync({
      type: "question",
      buttons: ["취소", "기존 앱 교체"],
      defaultId: 1,
      cancelId: 0,
      message: "기존 Heather를 교체하시겠습니까?",
      detail: "응용 프로그램 폴더에 설치된 이전 버전을 새 버전으로 교체합니다."
    }) === 1;
  }

  return false;
}

async function installIntoApplicationsIfNeeded() {
  if (process.platform !== "darwin" || !app.isPackaged || app.isInApplicationsFolder()) {
    return false;
  }

  const choice = dialog.showMessageBoxSync({
    type: "question",
    buttons: ["응용 프로그램에 설치", "설치하지 않고 실행"],
    defaultId: 0,
    cancelId: 1,
    message: "Heather를 Mac에 설치하시겠습니까?",
    detail: "Heather.app을 응용 프로그램 폴더로 이동한 뒤 자동으로 다시 실행합니다."
  });

  if (choice !== 0) return false;

  try {
    const moved = app.moveToApplicationsFolder({ conflictHandler });
    if (!moved) {
      dialog.showMessageBoxSync({
        type: "warning",
        buttons: ["확인"],
        message: "Heather를 응용 프로그램 폴더로 이동하지 못했습니다.",
        detail: "DMG 창에서 Heather 아이콘을 Applications 아이콘으로 직접 끌어다 놓으세요."
      });
    }
    return moved;
  } catch (error) {
    dialog.showMessageBoxSync({
      type: "error",
      buttons: ["확인"],
      message: "Heather 설치에 실패했습니다.",
      detail: String(error && error.message ? error.message : error)
    });
    return false;
  }
}

app.whenReady().then(async () => {
  const moved = await installIntoApplicationsIfNeeded();
  if (!moved) require("./main.cjs");
});
