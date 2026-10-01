Attribute VB_Name = "modMain"
'==============================================================================
' modMain - Macro principal (AtualizarInvestimentos)
'==============================================================================
' Orquestra o fluxo, tudo em VBA puro (sem Python):
'   1. Investimentos: duplica ultima leva se virou o mes.
'   2. Cotacoes: busca APIs (HTTP nativo) e insere/atualiza.
'   3. Timestamp em Cotacoes!A1:A2.
'   4. Recalcula e salva.

Option Explicit

' *** MACRO PRINCIPAL: vincular ao botao ***
Public Sub AtualizarInvestimentos()
    Dim startTime As Double
    Dim prevCalc As XlCalculation

    On Error GoTo ErrorHandler

    startTime = Timer

    ' *** SETUP ***
    prevCalc = Application.Calculation
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual
    Application.DisplayStatusBar = True

    ' 1. Investimentos (VBA puro)
    Application.StatusBar = "Atualizando investimentos..."
    UpdateInvestments

    ' 2. Cotacoes (HTTP nativo do Excel)
    Application.StatusBar = "Buscando cotacoes nas APIs..."
    UpdateQuotes

    ' 3. Timestamp
    UpdateTimestamps

    ' 4. Limpar sheet de scratch usada pelo HTTP
    RemoveScratchSheet

    ' *** CLEANUP ***
    Application.Calculation = prevCalc
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Application.CalculateFull
    ThisWorkbook.Save

    Application.StatusBar = False
    MsgBox "Atualizacao concluida! (" & Format(Timer - startTime, "0.0") & "s)", vbInformation, "Sucesso"
    Exit Sub

ErrorHandler:
    ' Restaurar estado mesmo em erro
    On Error Resume Next
    RemoveScratchSheet
    Application.Calculation = prevCalc
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Application.StatusBar = False
    On Error GoTo 0

    MsgBox "Erro durante atualizacao: " & Err.Description & vbCrLf & "(Erro " & Err.Number & ")", vbCritical, "Erro"
End Sub

' *** HELPER: timestamp na aba Cotacoes ***
Private Sub UpdateTimestamps()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_COTACOES)
    If ws Is Nothing Then Exit Sub
    ws.Range("A1").Value = "Ultima Atualizacao"
    ws.Range("A2").Value = Format(Now, "dd/mm/yyyy hh:mm:ss")
    On Error GoTo 0
End Sub
