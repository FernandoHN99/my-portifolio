'==============================================================================
' KeyValueStore - substituto nativo do Scripting.Dictionary
'==============================================================================
' Cole este codigo direto em um Class Module chamado KeyValueStore.
' O Excel para Mac NAO possui Microsoft Scripting Runtime, entao
' CreateObject("Scripting.Dictionary") falha em runtime. Esta classe
' replica o minimo usado no projeto: Item (get/set por chave), Exists e Count.
' Funciona no Mac e no Windows.
'
' Uso:
'   Dim d As KeyValueStore
'   Set d = New KeyValueStore
'   d.Item("Ticker") = "USD"
'   x = d.Item("Ticker")
'   If d.Exists("Ticker") Then ...
'
' Chaves sao tratadas como String (case-sensitive), igual ao uso atual.

Option Explicit

Private mKeys As Collection
Private mVals As Collection

Private Sub Class_Initialize()
    Set mKeys = New Collection
    Set mVals = New Collection
End Sub

' Localiza o indice (1-based) de uma chave; 0 se nao existir.
Private Function IndexOfKey(ByVal key As String) As Long
    Dim i As Long
    For i = 1 To mKeys.Count
        If mKeys(i) = key Then
            IndexOfKey = i
            Exit Function
        End If
    Next i
    IndexOfKey = 0
End Function

' *** Item - GET ***
Public Property Get Item(ByVal key As String) As Variant
    Dim idx As Long
    idx = IndexOfKey(key)
    If idx = 0 Then
        Item = Null
    Else
        If IsObject(mVals(idx)) Then
            Set Item = mVals(idx)
        Else
            Item = mVals(idx)
        End If
    End If
End Property

' *** Item - LET (valores simples) ***
Public Property Let Item(ByVal key As String, ByVal value As Variant)
    UpsertValue key, value
End Property

' *** Item - SET (objetos) ***
Public Property Set Item(ByVal key As String, ByVal value As Object)
    UpsertValue key, value
End Property

' Insere ou atualiza a chave.
Private Sub UpsertValue(ByVal key As String, ByVal value As Variant)
    Dim idx As Long
    idx = IndexOfKey(key)
    If idx = 0 Then
        mKeys.Add key
        mVals.Add value
    Else
        ' Collection nao permite substituir no lugar: remove e reinsere
        mKeys.Remove idx
        mVals.Remove idx
        If idx > mKeys.Count Then
            mKeys.Add key
            mVals.Add value
        Else
            mKeys.Add key, , idx
            mVals.Add value, , idx
        End If
    End If
End Sub

' *** Existe a chave? ***
Public Function Exists(ByVal key As String) As Boolean
    Exists = (IndexOfKey(key) > 0)
End Function

' *** Numero de itens ***
Public Property Get Count() As Long
    Count = mKeys.Count
End Property
